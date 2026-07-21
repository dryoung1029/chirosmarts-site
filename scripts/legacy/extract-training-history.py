#!/usr/bin/env python3
"""
Extract a searchable training-history report from a ChiroSmarts WordPress (WP
Courseware) database dump — WITHOUT needing MySQL or any install. Runs entirely
on your machine; the big .sql file never leaves it.

For every person + course it finds, it reports how far they got, whether they
completed, when, and whether a certificate was issued.

USAGE (on your Mac, in Terminal):
    python3 scripts/legacy/extract-training-history.py /path/to/backup_db.sql

That writes `training_history.csv` next to the script's working directory (and
prints a short summary). Open the CSV in Numbers/Excel to look anyone up, or
send it back and it can be loaded into the admin as a searchable lookup.

It reads these tables: wp_users, wp_usermeta (first/last name), wp_wpcw_courses,
wp_wpcw_user_courses (progress), wp_wpcw_certificates. Column order is read from
each table's CREATE TABLE, so it adapts if the schema differs slightly.
"""
import csv
import re
import sys

TARGET_TABLES = {
    "wp_users",
    "wp_usermeta",
    "wp_wpcw_courses",
    "wp_wpcw_user_courses",
    "wp_wpcw_certificates",
}


def parse_row_tuples(values_blob):
    """Parse the `(...),(...),...` portion of a mysqldump INSERT into a list of
    lists of Python strings. NULL -> None. Handles backslash escaping."""
    rows, i, n = [], 0, len(values_blob)
    while i < n:
        while i < n and values_blob[i] != "(":
            i += 1
        if i >= n:
            break
        i += 1  # past '('
        row, field, in_str, is_null_candidate = [], [], False, True
        raw = []
        while i < n:
            c = values_blob[i]
            if in_str:
                if c == "\\" and i + 1 < n:
                    nxt = values_blob[i + 1]
                    field.append({"n": "\n", "t": "\t", "r": "\r", "0": "\0"}.get(nxt, nxt))
                    i += 2
                    continue
                if c == "'":
                    in_str = False
                    i += 1
                    continue
                field.append(c)
                i += 1
                continue
            if c == "'":
                in_str = True
                is_null_candidate = False
                i += 1
                continue
            if c == ",":
                token = "".join(field)
                row.append(None if (is_null_candidate and token.strip().upper() == "NULL") else token)
                field, is_null_candidate = [], True
                i += 1
                continue
            if c == ")":
                token = "".join(field)
                row.append(None if (is_null_candidate and token.strip().upper() == "NULL") else token)
                rows.append(row)
                i += 1
                break
            field.append(c)
            i += 1
        _ = raw
    return rows


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 extract-training-history.py /path/to/backup_db.sql")
        sys.exit(1)
    path = sys.argv[1]

    create_cols = {}       # table -> [col names in order]
    inserts = {t: [] for t in TARGET_TABLES}  # table -> list of raw row-lists

    cur_create = None
    cur_cols = []
    buf = None             # buffered multi-line INSERT statement
    buf_table = None

    create_start = re.compile(r"^CREATE TABLE `([^`]+)`")
    col_line = re.compile(r"^\s*`([^`]+)`")
    insert_start = re.compile(r"^INSERT INTO `([^`]+)`")

    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if buf is not None:
                buf += line
                if line.rstrip().endswith(";"):
                    m = re.search(r"\bVALUES\b", buf, re.IGNORECASE)
                    if m:
                        inserts[buf_table].extend(parse_row_tuples(buf[m.end():]))
                    buf, buf_table = None, None
                continue

            if cur_create is not None:
                cm = col_line.match(line)
                if cm and not line.lstrip().startswith(("PRIMARY", "KEY", "UNIQUE", "CONSTRAINT", "FULLTEXT")):
                    cur_cols.append(cm.group(1))
                if line.startswith(")"):
                    create_cols[cur_create] = cur_cols
                    cur_create, cur_cols = None, []
                continue

            cs = create_start.match(line)
            if cs:
                if cs.group(1) in TARGET_TABLES:
                    cur_create, cur_cols = cs.group(1), []
                continue

            ins = insert_start.match(line)
            if ins and ins.group(1) in TARGET_TABLES:
                if line.rstrip().endswith(";"):
                    m = re.search(r"\bVALUES\b", line, re.IGNORECASE)
                    if m:
                        inserts[ins.group(1)].extend(parse_row_tuples(line[m.end():]))
                else:
                    buf, buf_table = line, ins.group(1)

    def idx(table, *candidates):
        cols = create_cols.get(table, [])
        for cand in candidates:
            for j, c in enumerate(cols):
                if c.lower() == cand.lower():
                    return j
        # substring fallback
        for cand in candidates:
            for j, c in enumerate(cols):
                if cand.lower() in c.lower():
                    return j
        return None

    # --- users: id -> (email, display_name)
    u_id = idx("wp_users", "ID")
    u_email = idx("wp_users", "user_email")
    u_display = idx("wp_users", "display_name")
    users = {}
    for r in inserts["wp_users"]:
        if u_id is not None and u_id < len(r):
            users[r[u_id]] = (r[u_email] if u_email is not None else "",
                              r[u_display] if u_display is not None else "")

    # --- usermeta: first/last name
    m_uid = idx("wp_usermeta", "user_id")
    m_key = idx("wp_usermeta", "meta_key")
    m_val = idx("wp_usermeta", "meta_value")
    first, last = {}, {}
    for r in inserts["wp_usermeta"]:
        if None in (m_uid, m_key, m_val) or m_key >= len(r):
            continue
        k = r[m_key]
        if k == "first_name":
            first[r[m_uid]] = r[m_val]
        elif k == "last_name":
            last[r[m_uid]] = r[m_val]

    # --- courses: id -> title
    c_id = idx("wp_wpcw_courses", "course_id")
    c_title = idx("wp_wpcw_courses", "course_title")
    courses = {}
    for r in inserts["wp_wpcw_courses"]:
        if c_id is not None and c_id < len(r):
            courses[r[c_id]] = r[c_title] if c_title is not None else ""

    # --- certificates: (user,course) -> (date, key)
    ct_u = idx("wp_wpcw_certificates", "cert_user_id", "user_id")
    ct_c = idx("wp_wpcw_certificates", "cert_course_id", "course_id")
    ct_d = idx("wp_wpcw_certificates", "cert_date", "date")
    ct_k = idx("wp_wpcw_certificates", "cert_access_key", "access_key")
    certs = {}
    for r in inserts["wp_wpcw_certificates"]:
        if None in (ct_u, ct_c):
            continue
        certs[(r[ct_u], r[ct_c])] = (r[ct_d] if ct_d is not None else "",
                                     r[ct_k] if ct_k is not None else "")

    # --- user_courses: the spine
    uc_u = idx("wp_wpcw_user_courses", "user_id")
    uc_c = idx("wp_wpcw_user_courses", "course_id")
    uc_prog = idx("wp_wpcw_user_courses", "course_progress", "progress")
    uc_done = idx("wp_wpcw_user_courses", "course_completed_date", "completed_date", "date_completed")
    uc_enrol = idx("wp_wpcw_user_courses", "course_enrolment_date", "enrolment_date", "date_enrolled")

    rows_out, completed_n, total = [], 0, 0
    for r in inserts["wp_wpcw_user_courses"]:
        if None in (uc_u, uc_c) or uc_c >= len(r):
            continue
        uid, cid = r[uc_u], r[uc_c]
        email, display = users.get(uid, ("", ""))
        fn = first.get(uid, "")
        ln = last.get(uid, "")
        progress = r[uc_prog] if (uc_prog is not None and uc_prog < len(r)) else ""
        completed_date = r[uc_done] if (uc_done is not None and uc_done < len(r)) else ""
        enrol_date = r[uc_enrol] if (uc_enrol is not None and uc_enrol < len(r)) else ""
        cert_date, cert_key = certs.get((uid, cid), ("", ""))
        try:
            pct = float(progress) if progress not in (None, "") else 0.0
        except ValueError:
            pct = 0.0
        is_done = bool(cert_key) or pct >= 100 or (completed_date not in (None, "", "0000-00-00 00:00:00"))
        status = "completed" if is_done else ("in progress" if pct > 0 else "not started")
        if is_done:
            completed_n += 1
        total += 1
        rows_out.append({
            "last_name": ln or "", "first_name": fn or "",
            "display_name": display or "", "email": email or "",
            "course": courses.get(cid, cid), "status": status,
            "progress_percent": progress or "",
            "completed_date": completed_date or "",
            "certificate_date": cert_date or "",
            "certificate_key": cert_key or "",
            "enrolled_date": enrol_date or "",
        })

    rows_out.sort(key=lambda x: (x["last_name"].lower(), x["first_name"].lower(), x["course"]))
    out = "training_history.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows_out[0].keys()) if rows_out else
                           ["last_name", "first_name", "display_name", "email", "course",
                            "status", "progress_percent", "completed_date",
                            "certificate_date", "certificate_key", "enrolled_date"])
        w.writeheader()
        w.writerows(rows_out)

    print(f"Wrote {out}")
    print(f"  {total} course-enrolments across {len(users)} people")
    print(f"  {completed_n} completed, {total - completed_n} partial/not-started")
    print(f"  {len(certs)} certificates on record; {len(courses)} courses")
    if not create_cols:
        print("  WARNING: no CREATE TABLE blocks parsed — is this a full mysqldump .sql?")


if __name__ == "__main__":
    main()
