#!/bin/bash
# dom-check.sh — DOM-level verification of Phase 6/7/8 UI structure:
# compact 2-column user form, three rendered recharts charts, register rows,
# and the attendance draft-delete button.
set -u
ab() { agent-browser "$@"; }

ab open http://localhost:3000/ > /dev/null; sleep 2
U=$(ab snapshot -i 2>/dev/null | grep -oE 'textbox "نام کاربری"[^]]*ref=e[0-9]+' | grep -oE 'e[0-9]+' | head -1)
P=$(ab snapshot -i 2>/dev/null | grep -oE 'textbox "رمز"[^]]*ref=e[0-9]+' | grep -oE 'e[0-9]+' | head -1)
L=$(ab snapshot -i 2>/dev/null | grep -oE 'button "ورود"[^]]*ref=e[0-9]+' | grep -oE 'e[0-9]+' | head -1)
ab fill @"$U" "admin" > /dev/null; ab fill @"$P" "Admin1234" > /dev/null; ab click @"$L" > /dev/null; sleep 3

echo "── 1. user create form: compact grid ──"
ab open "http://localhost:3000/#/settings/users" > /dev/null; sleep 3
BTN=$(ab snapshot -i 2>/dev/null | grep -oE 'button "کاربر جدید"[^]]*ref=e[0-9]+' | grep -oE 'e[0-9]+' | head -1)
ab click @"$BTN" > /dev/null; sleep 1
ab eval "(() => {
  const dlg = document.querySelector('[role=dialog]');
  const grid = dlg ? dlg.querySelector('div.grid') : null;
  return {
    hasDialog: !!dlg,
    gridClass: grid ? grid.className : null,
    twoCols: grid ? /sm:grid-cols-2/.test(grid.className) : false,
    inputs: dlg ? dlg.querySelectorAll('input').length : 0,
    selects: dlg ? dlg.querySelectorAll('[role=combobox]').length : 0,
  };
})()"

echo "── 2. analytics: three charts rendered ──"
ab open "http://localhost:3000/#/analytics" > /dev/null; sleep 5
ab eval "(() => ({
  chartSurfaces: document.querySelectorAll('svg.recharts-surface').length,
  barRects: document.querySelectorAll('.recharts-bar-rectangle').length,
  lines: document.querySelectorAll('.recharts-line').length,
  xTicks: document.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick').length,
  atRiskRows: document.querySelectorAll('table tbody tr').length,
}))()"

echo "── 3. discipline: register rows + filters ──"
ab open "http://localhost:3000/#/discipline" > /dev/null; sleep 3
ab eval "(() => ({
  rows: document.querySelectorAll('table tbody tr').length,
  filterSelects: document.querySelectorAll('[data-slot=select-trigger], button[role=combobox]').length,
  badges: document.querySelectorAll('table [data-slot=badge], table .inline-flex').length,
}))()"

echo "── 4. branches: master table ──"
ab open "http://localhost:3000/#/settings/branches" > /dev/null; sleep 3
ab eval "(() => ({
  rows: document.querySelectorAll('table tbody tr').length,
  headers: Array.from(document.querySelectorAll('table thead th')).map(th => th.textContent.trim()).join(' | '),
}))()"

echo "── 5. attendance: open-session delete button ──"
ab open "http://localhost:3000/#/attendance" > /dev/null; sleep 3
# open the section select and pick صنف چهارم «الف» (has the seeded open session)
TRG=$(ab snapshot -i 2>/dev/null | grep -oE 'combobox \[expanded=false[^\]]*\]ref=e[0-9]+' | grep -oE 'e[0-9]+' | sed -n '2p')
ab click @"$TRG" > /dev/null; sleep 1
OPT=$(ab snapshot -i 2>/dev/null | grep -oE 'option "صنف چهارم[^"]*"[^]]*ref=e[0-9]+' | grep -oE 'e[0-9]+' | head -1)
echo "option ref: $OPT"
[ -n "$OPT" ] && ab click @"$OPT" > /dev/null
sleep 2
# set the date input to the seeded open-session date (1405/08/15 = 2026-11-06)
DT=$(ab snapshot -i 2>/dev/null | grep -oE 'textbox[^"]*"[^"]*"[^]]*ref=e[0-9]+' | grep -oE 'e[0-9]+' | head -1)
echo "date textbox ref: $DT"
ab eval "(() => {
  const inp = document.querySelector('input[placeholder*=\"تاریخ\"]') || document.querySelectorAll('input[type=text]')[0];
  return { placeholder: inp ? inp.placeholder : null };
})()"
ab snapshot -i 2>/dev/null | grep -E 'textbox' | head -4
ab snapshot 2>/dev/null | grep -cE "حذف پیش‌نویس"
ab eval "(() => ({
  deleteButtons: Array.from(document.querySelectorAll('button[title=\"حذف پیش‌نویس\"]')).length,
}))()"

echo "── 6. final error sweep ──"
echo "page errors:"; ab errors 2>/dev/null | head -5
echo "console errors:"; ab console 2>/dev/null | grep -iE "error|unhandled" | head -5
ab close > /dev/null 2>&1
