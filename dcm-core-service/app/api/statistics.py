from fastapi import APIRouter, Depends
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Study, Series, Instance

router = APIRouter(prefix="/statistics", tags=["statistics"])


@router.get("")
async def get_statistics(db: AsyncSession = Depends(get_db)):
    # --- Totals ---
    total_studies = await db.scalar(
        select(func.count(Study.id)).where(Study.deleted_at.is_(None))
    )
    total_series = await db.scalar(
        select(func.count(Series.id)).where(Series.deleted_at.is_(None))
    )
    total_instances = await db.scalar(
        select(func.count(Instance.id)).where(Instance.deleted_at.is_(None))
    )

    # --- Studies by modality (count distinct studies that have a series with given modality) ---
    modality_result = await db.execute(
        select(Series.modality, func.count(Series.study_id.distinct()).label("count"))
        .where(Series.deleted_at.is_(None))
        .group_by(Series.modality)
        .order_by(func.count(Series.study_id.distinct()).desc())
    )
    studies_by_modality = [
        {"modality": row.modality or "Unknown", "count": row.count}
        for row in modality_result
    ]

    # --- Studies by institution (top 10) ---
    institution_result = await db.execute(
        select(Study.institution_name, func.count().label("count"))
        .where(Study.deleted_at.is_(None), Study.institution_name.is_not(None))
        .group_by(Study.institution_name)
        .order_by(func.count().desc())
        .limit(10)
    )
    studies_by_institution = [
        {"institution": row.institution_name, "count": row.count}
        for row in institution_result
    ]

    # --- Studies by month (last 24 months, sorted ascending) ---
    month_result = await db.execute(
        select(
            func.to_char(Study.study_date, "YYYY-MM").label("year_month"),
            func.count().label("count"),
        )
        .where(Study.deleted_at.is_(None), Study.study_date.is_not(None))
        .group_by(func.to_char(Study.study_date, "YYYY-MM"))
        .order_by(func.to_char(Study.study_date, "YYYY-MM"))
        .limit(24)
    )
    studies_by_month = [
        {"year_month": row.year_month, "count": row.count}
        for row in month_result
    ]

    # --- Sex distribution ---
    sex_result = await db.execute(
        select(Study.patient_sex, func.count().label("count"))
        .where(Study.deleted_at.is_(None))
        .group_by(Study.patient_sex)
    )
    sex_labels = {"M": "Male", "F": "Female"}
    sex_distribution = [
        {"sex": sex_labels.get(row.patient_sex or "", "Unknown"), "count": row.count}
        for row in sex_result
    ]

    # --- Body parts examined (top 10, from series) ---
    body_part_result = await db.execute(
        select(Series.body_part_examined, func.count().label("count"))
        .where(
            Series.deleted_at.is_(None),
            Series.body_part_examined.is_not(None),
            Series.body_part_examined != "",
        )
        .group_by(Series.body_part_examined)
        .order_by(func.count().desc())
        .limit(10)
    )
    body_parts = [
        {"body_part": row.body_part_examined, "count": row.count}
        for row in body_part_result
    ]

    # --- Instance count per series – histogram buckets ---
    instance_dist_result = await db.execute(
        select(
            case(
                (Series.num_instances <= 10, "1–10"),
                (Series.num_instances <= 50, "11–50"),
                (Series.num_instances <= 100, "51–100"),
                (Series.num_instances <= 500, "101–500"),
                else_="500+",
            ).label("bucket"),
            func.count().label("count"),
        )
        .where(Series.deleted_at.is_(None))
        .group_by("bucket")
        .order_by("bucket")
    )
    instance_distribution = [
        {"bucket": row.bucket, "count": row.count}
        for row in instance_dist_result
    ]

    return {
        "totals": {
            "studies": total_studies or 0,
            "series": total_series or 0,
            "instances": total_instances or 0,
        },
        "studies_by_modality": studies_by_modality,
        "studies_by_institution": studies_by_institution,
        "studies_by_month": studies_by_month,
        "sex_distribution": sex_distribution,
        "body_parts": body_parts,
        "instance_distribution": instance_distribution,
    }
