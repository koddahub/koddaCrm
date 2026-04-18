from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import date
from typing import Any

import pandas as pd
import streamlit as st
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine


def get_engine() -> Engine:
    connection_url = st.secrets.get("database_url") or st.secrets["connections"]["postgres"]["url"]
    return create_engine(connection_url, pool_pre_ping=True)


def normalize_filters(filters: Mapping[str, Any] | None) -> str:
    source = filters or {}
    normalized = {
        "ufs": tuple(sorted(source.get("ufs", ()))),
        "portes": tuple(sorted(source.get("portes", ()))),
        "date_start": source.get("date_start").isoformat() if source.get("date_start") else None,
        "date_end": source.get("date_end").isoformat() if source.get("date_end") else None,
    }
    return json.dumps(normalized, sort_keys=True)


def parse_filters(filters_key: str) -> dict[str, Any]:
    parsed = json.loads(filters_key)
    return {
        "ufs": list(parsed.get("ufs", ())),
        "portes": list(parsed.get("portes", ())),
        "date_start": parsed.get("date_start"),
        "date_end": parsed.get("date_end"),
    }


def build_where_clause(filters: Mapping[str, Any] | None, estabelecimento_alias: str = "e", empresa_alias: str = "emp") -> tuple[str, dict[str, Any]]:
    active_filters = filters or {}
    conditions: list[str] = []
    parameters: dict[str, Any] = {}

    ufs = [uf.strip().upper() for uf in active_filters.get("ufs", []) if uf]
    portes = [porte for porte in active_filters.get("portes", []) if porte]
    date_start = active_filters.get("date_start")
    date_end = active_filters.get("date_end")

    if ufs:
        conditions.append(f"{estabelecimento_alias}.uf = ANY(:ufs)")
        parameters["ufs"] = ufs

    if portes:
        conditions.append(f"{empresa_alias}.porte = ANY(:portes)")
        parameters["portes"] = portes

    if date_start:
        conditions.append(f"{empresa_alias}.data_inicio_atividade >= :date_start")
        parameters["date_start"] = date_start

    if date_end:
        conditions.append(f"{empresa_alias}.data_inicio_atividade <= :date_end")
        parameters["date_end"] = date_end

    if not conditions:
        return "", parameters

    return "WHERE " + " AND ".join(conditions), parameters


@st.cache_data(ttl=900, show_spinner=False)
def run_query(query: str, parameters_key: str) -> pd.DataFrame:
    parameters = json.loads(parameters_key)
    engine = get_engine()
    with engine.connect() as connection:
        return pd.read_sql_query(text(query), connection, params=parameters)


def execute_dataframe_query(query: str, parameters: Mapping[str, Any] | None = None) -> pd.DataFrame:
    serializable_parameters = json.dumps(parameters or {}, default=str, sort_keys=True)
    return run_query(query, serializable_parameters)


@st.cache_data(ttl=900, show_spinner=False)
def get_filter_options() -> dict[str, Any]:
    uf_query = """
        SELECT DISTINCT e.uf
        FROM estabelecimentos e
        WHERE e.uf IS NOT NULL AND TRIM(e.uf) <> ''
        ORDER BY e.uf
    """
    porte_query = """
        SELECT DISTINCT emp.porte
        FROM empresas emp
        WHERE emp.porte IS NOT NULL AND TRIM(emp.porte) <> ''
        ORDER BY emp.porte
    """
    date_query = """
        SELECT
            MIN(emp.data_inicio_atividade) AS min_date,
            MAX(emp.data_inicio_atividade) AS max_date
        FROM empresas emp
        WHERE emp.data_inicio_atividade IS NOT NULL
    """

    uf_frame = execute_dataframe_query(uf_query)
    porte_frame = execute_dataframe_query(porte_query)
    date_frame = execute_dataframe_query(date_query)

    min_date = pd.to_datetime(date_frame.iloc[0]["min_date"]).date() if pd.notna(date_frame.iloc[0]["min_date"]) else date(1900, 1, 1)
    max_date = pd.to_datetime(date_frame.iloc[0]["max_date"]).date() if pd.notna(date_frame.iloc[0]["max_date"]) else date.today()

    return {
        "ufs": uf_frame["uf"].astype(str).str.upper().sort_values().tolist(),
        "portes": porte_frame["porte"].astype(str).sort_values().tolist(),
        "min_date": min_date,
        "max_date": max_date,
    }


def get_estabelecimentos(filters: Mapping[str, Any] | None = None) -> pd.DataFrame:
    where_clause, parameters = build_where_clause(filters)
    query = f"""
        SELECT
            e.cnpj_basico,
            e.uf,
            e.email,
            e.telefone_1
        FROM estabelecimentos e
        JOIN empresas emp ON emp.cnpj_basico = e.cnpj_basico
        {where_clause}
    """
    return execute_dataframe_query(query, parameters)


def get_empresas(filters: Mapping[str, Any] | None = None) -> pd.DataFrame:
    where_clause, parameters = build_where_clause(filters)
    query = f"""
        SELECT
            emp.cnpj_basico,
            emp.porte,
            emp.data_inicio_atividade
        FROM empresas emp
        JOIN estabelecimentos e ON e.cnpj_basico = emp.cnpj_basico
        {where_clause}
    """
    return execute_dataframe_query(query, parameters)


@st.cache_data(ttl=900, show_spinner=False)
def get_overview_metrics(filters: Mapping[str, Any] | None) -> dict[str, Any]:
    filters_key = normalize_filters(filters)
    parsed_filters = parse_filters(filters_key)
    where_clause, parameters = build_where_clause(parsed_filters)

    query = f"""
        SELECT
            COUNT(*)::bigint AS total_leads,
            COUNT(DISTINCT emp.cnpj_basico)::bigint AS total_companies,
            ROUND(
                100.0 * AVG(
                    CASE
                        WHEN e.email IS NOT NULL OR e.telefone_1 IS NOT NULL THEN 1
                        ELSE 0
                    END
                ),
                2
            ) AS enriched_rate,
            ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT e.uf), 0), 2) AS average_leads_per_uf
        FROM estabelecimentos e
        JOIN empresas emp ON emp.cnpj_basico = e.cnpj_basico
        {where_clause}
    """
    frame = execute_dataframe_query(query, parameters)
    row = frame.iloc[0].fillna(0)
    return {
        "total_leads": int(row["total_leads"]),
        "total_companies": int(row["total_companies"]),
        "enriched_rate": float(row["enriched_rate"]),
        "average_leads_per_uf": float(row["average_leads_per_uf"]),
    }


@st.cache_data(ttl=900, show_spinner=False)
def get_company_size_distribution(filters: Mapping[str, Any] | None) -> pd.DataFrame:
    filters_key = normalize_filters(filters)
    parsed_filters = parse_filters(filters_key)
    where_clause, parameters = build_where_clause(parsed_filters)

    query = f"""
        SELECT
            COALESCE(NULLIF(TRIM(emp.porte), ''), 'Não informado') AS porte,
            COUNT(*)::bigint AS total
        FROM empresas emp
        JOIN estabelecimentos e ON e.cnpj_basico = emp.cnpj_basico
        {where_clause}
        GROUP BY 1
        ORDER BY total DESC, porte
    """
    return execute_dataframe_query(query, parameters)


@st.cache_data(ttl=900, show_spinner=False)
def get_activity_timeline(filters: Mapping[str, Any] | None) -> pd.DataFrame:
    filters_key = normalize_filters(filters)
    parsed_filters = parse_filters(filters_key)
    where_clause, parameters = build_where_clause(parsed_filters)

    query = f"""
        SELECT
            EXTRACT(YEAR FROM emp.data_inicio_atividade)::int AS year,
            COUNT(*)::bigint AS total
        FROM empresas emp
        JOIN estabelecimentos e ON e.cnpj_basico = emp.cnpj_basico
        {where_clause}
        AND emp.data_inicio_atividade IS NOT NULL
        GROUP BY 1
        ORDER BY 1
    """ if where_clause else """
        SELECT
            EXTRACT(YEAR FROM emp.data_inicio_atividade)::int AS year,
            COUNT(*)::bigint AS total
        FROM empresas emp
        JOIN estabelecimentos e ON e.cnpj_basico = emp.cnpj_basico
        WHERE emp.data_inicio_atividade IS NOT NULL
        GROUP BY 1
        ORDER BY 1
    """
    return execute_dataframe_query(query, parameters)


@st.cache_data(ttl=900, show_spinner=False)
def get_data_quality_metrics(filters: Mapping[str, Any] | None) -> dict[str, float]:
    filters_key = normalize_filters(filters)
    parsed_filters = parse_filters(filters_key)
    where_clause, parameters = build_where_clause(parsed_filters)

    query = f"""
        SELECT
            ROUND(100.0 * AVG(CASE WHEN e.email IS NOT NULL THEN 1 ELSE 0 END), 2) AS email_rate,
            ROUND(100.0 * AVG(CASE WHEN e.telefone_1 IS NOT NULL THEN 1 ELSE 0 END), 2) AS phone_rate,
            ROUND(
                100.0 * AVG(
                    CASE
                        WHEN e.email IS NOT NULL OR e.telefone_1 IS NOT NULL THEN 1
                        ELSE 0
                    END
                ),
                2
            ) AS enriched_rate
        FROM estabelecimentos e
        JOIN empresas emp ON emp.cnpj_basico = e.cnpj_basico
        {where_clause}
    """
    frame = execute_dataframe_query(query, parameters)
    row = frame.iloc[0].fillna(0)
    return {
        "email_rate": float(row["email_rate"]),
        "phone_rate": float(row["phone_rate"]),
        "enriched_rate": float(row["enriched_rate"]),
    }


@st.cache_data(ttl=900, show_spinner=False)
def get_brazil_geojson() -> dict[str, Any]:
    geojson_url = "https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson"
    return pd.read_json(geojson_url).to_dict()


@st.cache_data(ttl=900, show_spinner=False)
def get_brazil_heatmap_data(filters: Mapping[str, Any] | None) -> pd.DataFrame:
    filters_key = normalize_filters(filters)
    parsed_filters = parse_filters(filters_key)
    where_clause, parameters = build_where_clause(parsed_filters)

    query = f"""
        SELECT
            UPPER(TRIM(e.uf)) AS uf,
            COUNT(*)::bigint AS total
        FROM estabelecimentos e
        JOIN empresas emp ON emp.cnpj_basico = e.cnpj_basico
        {where_clause}
        GROUP BY 1
        ORDER BY total DESC, uf
    """
    return execute_dataframe_query(query, parameters)
