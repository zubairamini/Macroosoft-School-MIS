#!/bin/bash
# browser-check.sh — agent-browser verification of the Phase 6/7/8 screens.
# Run via: bash scripts/with-dev.sh bash scripts/browser-check.sh
# (server + browser must share one Bash invocation in this sandbox)

set -u
mkdir -p /tmp/render

ab() { agent-browser "$@"; }

echo "═══ 1. login as admin ═══"
ab open http://localhost:3000/ > /dev/null
sleep 2
ab snapshot -i 2>/dev/null | grep -E 'textbox "نام کاربری"|textbox "رمز"|button "ورود"' | head -3
ab fill @e10 "admin" > /dev/null 2>&1 || true
# refs are dynamic — find them robustly:
U=$(ab snapshot -i 2>/dev/null | grep -oE 'textbox "نام کاربری"[^]]*ref=e[0-9]+' | grep -oE 'e[0-9]+' | head -1)
P=$(ab snapshot -i 2>/dev/null | grep -oE 'textbox "رمز"[^]]*ref=e[0-9]+' | grep -oE 'e[0-9]+' | head -1)
L=$(ab snapshot -i 2>/dev/null | grep -oE 'button "ورود"[^]]*ref=e[0-9]+' | grep -oE 'e[0-9]+' | head -1)
ab fill @"$U" "admin" > /dev/null
ab fill @"$P" "Admin1234" > /dev/null
ab click @"$L" > /dev/null
sleep 3
ab get url
echo "--- login done ---"

echo "═══ 2. branches tab ═══"
ab open "http://localhost:3000/#/settings/branches" > /dev/null
sleep 3
ab snapshot 2>/dev/null | grep -E "شعبهٔ مرکزی|خوشحال خان|شعبه‌های مکتب|شاگردان فعال|فعال" | head -10
ab screenshot /tmp/render/branches.png > /dev/null 2>&1
echo "--- branches done ---"

echo "═══ 3. user create dialog (compact form) ═══"
ab open "http://localhost:3000/#/settings/users" > /dev/null
sleep 3
BTN=$(ab snapshot -i 2>/dev/null | grep -oE 'button "کاربر جدید"[^]]*ref=e[0-9]+' | grep -oE 'e[0-9]+' | head -1)
ab click @"$BTN" > /dev/null
sleep 1
ab snapshot 2>/dev/null | grep -E "کاربر جدید|نقش \*|شعبهٔ مکتب|نام کامل|رمز اولیه|شعبه‌های تخصیص" | head -10
ab screenshot /tmp/render/user-create.png > /dev/null 2>&1
# close dialog (cancel)
C=$(ab snapshot -i 2>/dev/null | grep -oE 'button "لغو"[^]]*ref=e[0-9]+' | grep -oE 'e[0-9]+' | head -1)
[ -n "$C" ] && ab click @"$C" > /dev/null
echo "--- user form done ---"

echo "═══ 4. attendance (draft delete button) ═══"
ab open "http://localhost:3000/#/attendance" > /dev/null
sleep 3
ab snapshot -i 2>/dev/null | grep -E 'tab |combobox|button "شروع ثبت' | head -6
ab snapshot 2>/dev/null | grep -E "سیشن‌های اخیر|حذف پیش‌نویس|title=" | head -6
ab screenshot /tmp/render/attendance.png > /dev/null 2>&1
echo "--- attendance done ---"

echo "═══ 5. discipline register ═══"
ab open "http://localhost:3000/#/discipline" > /dev/null
sleep 3
ab snapshot 2>/dev/null | grep -E "انضباط و رفتار|تأخیر|بدرفتاری|اقدام مثبت|حل‌نشده|مورد حل‌نشده" | head -12
ab screenshot /tmp/render/discipline.png > /dev/null 2>&1
echo "--- discipline done ---"

echo "═══ 6. analytics ═══"
ab open "http://localhost:3000/#/analytics" > /dev/null
sleep 4
ab snapshot 2>/dev/null | grep -E "تحلیل‌ها|شاگردان فعال|نرخ وصول|وقایع حل‌نشده|شاگردان در معرض خطر|نرخ غیرحاضری|اقدامات مثبت" | head -14
ab screenshot /tmp/render/analytics.png > /dev/null 2>&1
echo "--- analytics done ---"

echo "═══ 7. errors check ═══"
echo "--- page errors:"; ab errors 2>/dev/null | head -10
echo "--- console errors:"; ab console 2>/dev/null | grep -iE "error|unhandled" | head -10
echo "(empty = clean)"

ab close > /dev/null 2>&1
ls -la /tmp/render/
