#!/usr/bin/env python3
"""Validate src/lib/data/act2-showcase.json — the landing page's Act 2 asset.

Run before every commit that touches the file:

    python scripts/validate-showcase.py

The file is hand-committed marketing data that renders through the same
component as a live Supabase row, so nothing downstream re-checks it. Two
mid-word truncation bugs got into earlier drafts of this asset by someone
counting characters by hand; every check here exists because something once
slipped past a reader.

Exits non-zero and prints every failure, rather than stopping at the first —
fixing one anchor usually means fixing all of them.
"""

from __future__ import annotations

import json
import pathlib
import sys

ASSET = pathlib.Path(__file__).resolve().parent.parent / "src" / "lib" / "data" / "act2-showcase.json"

# Mirrors EvaluationOutput in src/app/api/evaluate/route.ts. token_cost and
# tokens_remaining are deliberately absent: per-request billing metadata has no
# place on a public page (handoff §6).
REQUIRED_TOP_LEVEL = {
    "subject": str,
    "board": str,
    "year": int,
    "question_number": str,
    "question_text": str,
    "student_answer_text": str,
    "total_marks": int,
    "marks_awarded": int,
    "is_objective": bool,
    "marking_points": list,
    "conceptual_errors": list,
    "icse_style_issues": list,
    "unassessable_components": list,
    "model_answer": str,
    "model_answer_source": str,
    "examiner_feedback": str,
    "improvement_tips": list,
}

FORBIDDEN_TOP_LEVEL = ("token_cost", "tokens_remaining")

VALID_STATUSES = ("awarded", "partial", "missed")


def validate(doc: dict) -> list[str]:
    errors: list[str] = []

    for key, kind in REQUIRED_TOP_LEVEL.items():
        if key not in doc:
            errors.append(f"missing required field: {key}")
        # bool is a subclass of int in Python — check it first or a stray
        # `true` would pass as a valid `year`.
        elif isinstance(doc[key], bool) != (kind is bool) or not isinstance(doc[key], kind):
            errors.append(f"{key}: expected {kind.__name__}, got {type(doc[key]).__name__}")

    for key in FORBIDDEN_TOP_LEVEL:
        if key in doc:
            errors.append(f"{key} must not appear in a public marketing asset")

    if doc.get("model_answer_source") not in ("verified", "ai_generated"):
        errors.append(f"model_answer_source: unexpected value {doc.get('model_answer_source')!r}")

    answer = doc.get("student_answer_text")
    points = doc.get("marking_points")
    if not isinstance(answer, str) or not isinstance(points, list):
        return errors  # nothing below can run meaningfully

    if not points:
        errors.append("marking_points is empty — Act 2 has nothing to reveal")

    running = 0
    for i, mp in enumerate(points):
        where = f"marking_points[{i}]"

        for key in ("point", "marks", "status", "marks_awarded", "matched_text", "anchor"):
            if key not in mp:
                errors.append(f"{where}: missing {key}")
        if any(k not in mp for k in ("point", "marks", "status", "marks_awarded")):
            continue

        if not isinstance(mp["point"], str) or not mp["point"].strip():
            errors.append(f"{where}: point must be non-empty text")

        status = mp["status"]
        if status not in VALID_STATUSES:
            errors.append(f"{where}: status {status!r} not one of {VALID_STATUSES}")

        marks, awarded = mp["marks"], mp["marks_awarded"]
        if not isinstance(marks, (int, float)) or marks <= 0:
            errors.append(f"{where}: marks must be positive")
        if not isinstance(awarded, (int, float)) or awarded < 0:
            errors.append(f"{where}: marks_awarded must be >= 0")
        elif isinstance(marks, (int, float)) and awarded > marks:
            errors.append(f"{where}: marks_awarded {awarded} exceeds marks {marks}")

        # status and marks_awarded are rendered by two different parts of the UI
        # (the colour token and the mono figure). If they disagree the section
        # contradicts itself on screen without erroring anywhere.
        if status == "awarded" and awarded != marks:
            errors.append(f"{where}: status 'awarded' but {awarded} of {marks} marks")
        if status == "missed" and awarded != 0:
            errors.append(f"{where}: status 'missed' but {awarded} marks awarded")
        if status == "partial" and not (0 < awarded < marks):
            errors.append(f"{where}: status 'partial' but marks_awarded is {awarded} of {marks}")

        if isinstance(awarded, (int, float)):
            running += awarded

        matched, anchor = mp.get("matched_text"), mp.get("anchor")

        if matched is None:
            if anchor is not None:
                errors.append(f"{where}: anchor present with no matched_text to derive it from")
            if status == "awarded":
                errors.append(f"{where}: awarded with no matched_text — nothing to highlight")
            continue

        if not isinstance(matched, str) or not matched:
            errors.append(f"{where}: matched_text must be null or non-empty text")
            continue

        # The ground-truth check. anchor is *derived* from matched_text by
        # exact search — the same thing resolveMarkingPointAnchors does in
        # route.ts — so recompute it and compare rather than trusting the file.
        start = answer.find(matched)
        if start == -1:
            errors.append(f"{where}: matched_text does not appear verbatim in student_answer_text")
            continue
        if answer.find(matched, start + 1) != -1:
            errors.append(f"{where}: matched_text appears more than once — the anchor is ambiguous")

        expected = {"start": start, "end": start + len(matched)}
        if anchor != expected:
            errors.append(f"{where}: anchor {anchor} should be {expected} (derive it, never count by hand)")

        # A mid-word cut survives every check above: "The Council of Minis" is
        # a genuine substring with a correct derived anchor, and it renders as a
        # highlight that stops in the middle of a word. Both truncation bugs in
        # this asset's history looked exactly like that, so check the edges land
        # between words rather than inside one.
        end = expected["end"]
        if start > 0 and (answer[start - 1].isalnum() and matched[0].isalnum()):
            errors.append(f"{where}: matched_text starts mid-word (…{answer[max(0, start - 12):end][:24]!r})")
        if end < len(answer) and (answer[end].isalnum() and matched[-1].isalnum()):
            errors.append(f"{where}: matched_text ends mid-word ({answer[start:end + 12][-24:]!r}…)")

    total = doc.get("total_marks")
    if isinstance(total, (int, float)):
        scheme_total = sum(
            mp["marks"] for mp in points if isinstance(mp.get("marks"), (int, float))
        )
        if scheme_total != total:
            errors.append(f"marking_points sum to {scheme_total} marks but total_marks is {total}")
    if running != doc.get("marks_awarded"):
        errors.append(
            f"marking_points award {running} marks but marks_awarded is {doc.get('marks_awarded')}"
        )

    statuses = {mp.get("status") for mp in points}
    # Not an error. History & Civics is binary-marked — one valid point is one
    # whole mark — so this question cannot produce a 'partial', and the
    # withheld-gold token simply does not appear in this demo. Accepted as-is
    # per handoff §6; noted so nobody reads its absence as a rendering bug.
    if "partial" not in statuses:
        print("note: no 'partial' point — withheld/gold is unexercised in this asset (expected)")

    return errors


def main() -> int:
    try:
        doc = json.loads(ASSET.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"FAIL: {ASSET} does not exist")
        return 1
    except json.JSONDecodeError as exc:
        print(f"FAIL: {ASSET.name} is not valid JSON — {exc}")
        return 1

    errors = validate(doc)
    if errors:
        print(f"FAIL: {ASSET.name} — {len(errors)} problem(s)")
        for err in errors:
            print(f"  - {err}")
        return 1

    print(
        f"OK: {ASSET.name} — {len(doc['marking_points'])} marking points, "
        f"{doc['marks_awarded']}/{doc['total_marks']} marks, all anchors verified"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
