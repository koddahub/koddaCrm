from __future__ import annotations

from typing import Any

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

from services.data_service import get_brazil_geojson


def apply_dark_theme(figure: go.Figure) -> go.Figure:
    figure.update_layout(
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font={"color": "#E5E7EB"},
        margin={"l": 16, "r": 16, "t": 48, "b": 16},
        legend={"orientation": "h", "yanchor": "bottom", "y": 1.02, "xanchor": "right", "x": 1},
    )
    return figure


def build_leads_by_uf_chart(data: pd.DataFrame) -> go.Figure:
    chart = px.bar(
        data.sort_values("total", ascending=False),
        x="uf",
        y="total",
        title="Leads por UF",
        labels={"uf": "UF", "total": "Leads"},
    )
    chart.update_traces(hovertemplate="UF=%{x}<br>Leads=%{y}<extra></extra>")
    chart.update_xaxes(categoryorder="total descending")
    return apply_dark_theme(chart)


def build_company_size_pie_chart(data: pd.DataFrame) -> go.Figure:
    chart = px.pie(
        data,
        names="porte",
        values="total",
        title="Distribuição por porte",
        hole=0.5,
    )
    chart.update_traces(textposition="inside", textinfo="percent+label")
    return apply_dark_theme(chart)


def build_activity_timeline_chart(data: pd.DataFrame) -> go.Figure:
    chart = px.line(
        data,
        x="year",
        y="total",
        title="Empresas por ano de início de atividade",
        markers=True,
        labels={"year": "Ano", "total": "Empresas"},
    )
    chart.update_traces(mode="lines+markers", hovertemplate="Ano=%{x}<br>Empresas=%{y}<extra></extra>")
    return apply_dark_theme(chart)


def build_data_quality_gauges(metrics: dict[str, float]) -> go.Figure:
    chart = go.Figure()
    chart.add_trace(
        go.Indicator(
            mode="gauge+number",
            value=metrics["email_rate"],
            domain={"x": [0.0, 0.3], "y": [0, 1]},
            title={"text": "Com email"},
            gauge={"axis": {"range": [0, 100]}},
        )
    )
    chart.add_trace(
        go.Indicator(
            mode="gauge+number",
            value=metrics["phone_rate"],
            domain={"x": [0.35, 0.65], "y": [0, 1]},
            title={"text": "Com telefone"},
            gauge={"axis": {"range": [0, 100]}},
        )
    )
    chart.add_trace(
        go.Indicator(
            mode="gauge+number",
            value=metrics["enriched_rate"],
            domain={"x": [0.7, 1.0], "y": [0, 1]},
            title={"text": "Enriquecidos"},
            gauge={"axis": {"range": [0, 100]}},
        )
    )
    chart.update_layout(title="Qualidade dos dados", grid={"rows": 1, "columns": 3, "pattern": "independent"})
    return apply_dark_theme(chart)


def build_brazil_heatmap(data: pd.DataFrame) -> go.Figure:
    geojson = get_brazil_geojson()
    chart = px.choropleth(
        data_frame=data,
        geojson=geojson,
        locations="uf",
        featureidkey="properties.sigla",
        color="total",
        color_continuous_scale="Viridis",
        projection="mercator",
        title="Estabelecimentos por estado",
        labels={"total": "Estabelecimentos"},
    )
    chart.update_geos(fitbounds="locations", visible=False, bgcolor="rgba(0,0,0,0)")
    return apply_dark_theme(chart)
