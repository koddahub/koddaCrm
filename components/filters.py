from __future__ import annotations

from typing import Any

import streamlit as st


def render_global_filters(filter_options: dict[str, Any]) -> dict[str, Any]:
    st.sidebar.header("Filtros")

    selected_ufs = st.sidebar.multiselect(
        "UF",
        options=filter_options["ufs"],
        default=[],
    )

    selected_portes = st.sidebar.multiselect(
        "Porte",
        options=filter_options["portes"],
        default=[],
    )

    selected_dates = st.sidebar.date_input(
        "Data de início de atividade",
        value=(filter_options["min_date"], filter_options["max_date"]),
        min_value=filter_options["min_date"],
        max_value=filter_options["max_date"],
    )

    if isinstance(selected_dates, tuple) and len(selected_dates) == 2:
        date_start, date_end = selected_dates
    else:
        date_start = filter_options["min_date"]
        date_end = filter_options["max_date"]

    return {
        "ufs": selected_ufs,
        "portes": selected_portes,
        "date_start": date_start,
        "date_end": date_end,
    }
