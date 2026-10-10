#!/usr/bin/env python3
"""Dependency-free smoke check for the SQLite v1→v2→v3 migration.

QuickSQLite is a native JSI module and cannot run inside Jest. This check uses
Python's SQLite engine to execute the same migration SQL, then verifies grouped
sale, debt, profit, sale-count, and linked-reversal behavior.
"""

from pathlib import Path
import re
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / "db" / "database.ts").read_text(encoding="utf-8")
region = source[
    source.index("const MIGRATIONS") : source.index(
        "// ------------------------------------------------------------\n// Bootstrap"
    )
]
statements = re.findall(r"`(.*?)`", region, re.S)

connection = sqlite3.connect(":memory:")
connection.execute("PRAGMA foreign_keys=ON")
for statement in statements:
    connection.execute(statement)

connection.execute(
    """INSERT INTO users
       (id,display_name,role,language,is_active,created_at,updated_at)
       VALUES ('u','Owner','OWNER','yo',1,'2026-10-10','2026-10-10')"""
)
connection.execute(
    """INSERT INTO customers
       (id,name,is_active,created_at,updated_at)
       VALUES ('c','Ayo',1,'2026-10-10','2026-10-10')"""
)
for product in (
    ("p1", "Rice", 10, 30_000, 50_000),
    ("p2", "Beans", 10, 10_000, 20_000),
):
    connection.execute(
        """INSERT INTO products
           (id,name,stock_quantity,cost_price_kobo,selling_price_kobo,
            is_active,created_at,updated_at)
           VALUES (?,?,?,?,?,1,'2026-10-10','2026-10-10')""",
        product,
    )

connection.execute(
    """INSERT INTO sale_groups
       (id,receipt_number,customer_id,total_amount_kobo,amount_paid_kobo,
        status,created_by,created_at,device_id,device_seq)
       VALUES ('g','AKE-1','c',70000,60000,'DEBT','u',
               '2026-10-10T10:00:00','d',1)"""
)
line_insert = """INSERT INTO transactions
  (id,product_id,customer_id,user_id,type,category,quantity,
   total_amount_kobo,amount_paid_kobo,status,input_method,sale_group_id,
   sale_line_index,created_at,device_seq)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"""
connection.execute(
    line_insert,
    (
        "t1", "p1", "c", "u", "INFLOW", "SALE", 1,
        50_000, 50_000, "PAID", "MANUAL", "g", 0,
        "2026-10-10T10:00:00", 1,
    ),
)
connection.execute(
    line_insert,
    (
        "t2", "p2", "c", "u", "INFLOW", "SALE", 1,
        20_000, 10_000, "DEBT", "MANUAL", "g", 1,
        "2026-10-10T10:00:00", 1,
    ),
)

summary = connection.execute(
    "SELECT cash_in_kobo,gross_profit_kobo,sales_count FROM v_daily_summary"
).fetchone()
debt = connection.execute(
    "SELECT balance_kobo FROM v_customer_debts"
).fetchone()
assert summary == (60_000, 30_000, 1), summary
assert debt == (10_000,), debt

for reversal_id, original_id, product_id, total, paid in (
    ("r1", "t1", "p1", 50_000, 50_000),
    ("r2", "t2", "p2", 20_000, 10_000),
):
    connection.execute(
        """INSERT INTO transactions
          (id,product_id,customer_id,user_id,type,category,quantity,
           total_amount_kobo,amount_paid_kobo,status,input_method,reversal_of,
           sale_group_id,created_at,device_seq)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            reversal_id, product_id, "c", "u", "OUTFLOW", "REVERSAL", 1,
            total, paid, "PAID", "MANUAL", original_id, "g",
            "2026-10-10T11:00:00", 2,
        ),
    )

assert connection.execute("SELECT COUNT(*) FROM v_customer_debts").fetchone()[0] == 0
assert connection.execute("SELECT COUNT(*) FROM v_daily_summary").fetchone()[0] == 0
print(
    "PASS: v1→v2→v3 schema, grouped receipt totals, debt/profit/count, "
    "and linked reversal exclusion"
)
