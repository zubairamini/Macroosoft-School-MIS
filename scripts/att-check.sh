#!/bin/bash
# att-check.sh — focused check: attendance draft delete button appears for
# the seeded OPEN session (صنف چهارم «الف», ۱۴۰۵/۰۸/۱۵ = 2026-11-06).
set -u
ab() { agent-browser "$@"; }

ab open http://localhost:3000/ > /dev/null; sleep 2
U=$(ab snapshot -i 2>/dev/null | grep -oE 'textbox "نام کاربری"[^]]*ref=e[0-9]+' | grep -oE 'e[0-9]+' | head -1)
P=$(ab snapshot -i 2>/dev/null | grep -oE 'textbox "رمز"[^]]*ref=e[0-9]+' | grep -oE 'e[0-9]+' | head -1)
L=$(ab snapshot -i 2>/dev/null | grep -oE 'button "ورود"[^]]*ref=e[0-9]+' | grep -oE 'e[0-9]+' | head -1)
ab fill @"$U" "teacher" > /dev/null; ab fill @"$P" "Teacher1234" > /dev/null; ab click @"$L" > /dev/null; sleep 3

ab open "http://localhost:3000/#/attendance" > /dev/null; sleep 3

echo "── open the section select (DOM click on the trigger holding «صنف») ──"
ab eval "(() => {
  const combos = Array.from(document.querySelectorAll('button[role=combobox]'));
  const sec = combos.find(c => /صنف/.test(c.textContent));
  if (sec) { sec.click(); return 'clicked: ' + sec.textContent.trim(); }
  return 'not found; combos=' + combos.map(c => c.textContent.trim()).join(' || ');
})()"
sleep 1

echo "── pick صنف چهارم «الف» ──"
ab eval "(() => {
  const opt = Array.from(document.querySelectorAll('[role=option]')).find(o => /صنف چهارم/.test(o.textContent) && /کارتهٔ نو|الف/.test(o.textContent));
  if (opt) { opt.click(); return 'picked: ' + opt.textContent.trim(); }
  return 'options: ' + Array.from(document.querySelectorAll('[role=option]')).slice(0,8).map(o => o.textContent.trim()).join(' || ');
})()"
sleep 2

echo "── set date to ۱۴۰۵/۰۸/۱۵ ──"
D=$(ab snapshot -i 2>/dev/null | grep -oE 'textbox "[^"]*۱۴۰۵[^"]*"[^]]*ref=e[0-9]+' | grep -oE 'e[0-9]+' | head -1)
echo "date ref: $D"
ab fill "@$D" "۱۴۰۵/۰۸/۱۵" > /dev/null 2>&1
sleep 2

echo "── recent sessions + delete button ──"
ab snapshot 2>/dev/null | grep -E "سیشن‌های اخیر|نا-ثبت|na|قطعی|باز" | head -8
ab eval "(() => ({
  deleteButtons: document.querySelectorAll('button[title=\"حذف پیش‌نویس\"]').length,
  recentButtons: Array.from(document.querySelectorAll('button[title=\"حذف پیش‌نویس\"]')).length,
  sessionRows: document.querySelectorAll('table tbody tr').length,
  statusBadges: Array.from(document.querySelectorAll('[data-slot=badge]')).map(b => b.textContent.trim()).slice(0, 10),
}))()"

echo "── click delete → confirm dialog appears ──"
ab eval "(() => { const b = document.querySelector('button[title=\"حذف پیش‌نویس\"]'); if (b) { b.click(); return 'clicked'; } return 'none'; })()"
sleep 1
ab snapshot 2>/dev/null | grep -E "حذف پیش‌نویس حاضری|حذف قطعی پیش‌نویس|ریکارود نظارتی" | head -4
echo "── errors ──"
ab errors 2>/dev/null | head -5
ab close > /dev/null 2>&1
