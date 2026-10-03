# -*- coding: utf-8 -*-
"""
فحص سلامة الخادم — نظام إدارة المخالفات المرورية
================================================
اثنتان وعشرون حالة تغطّي حواجز الخادم الأساسية، وخمسة فحوص لتكامل
قاعدة البيانات.

التشغيل:
    python tests/server_checks.py

يتطلّب: Apache وMySQL يعملان، وبيانات البذرة محمَّلة (database_seed.sql).
لا يُنشئ هذا الملف أي بيانات ولا يحذف شيئاً — كل حالاته قراءة أو طلب
مرفوض. فيمكن تشغيله على قاعدة العرض بلا خوف.

يُرجع رمز خروج 0 عند نجاح الكل، و1 عند أي فشل.
"""
import sys, json, urllib.request, urllib.error, http.cookiejar

BASE = "http://localhost/traffic/backend/api"

ACCOUNTS = {
    'admin':   ('admin@traffic.ly',    'admin123'),
    'dept':    ('dept1@traffic.ly',    'dept123'),
    'officer': ('officer1@traffic.ly', 'officer123'),
    'pay':     ('pay1@traffic.ly',     'pay123'),
}


def client():
    return urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def req(opener, method, path, body=None):
    """يُرجع رمز الاستجابة. -1 إن تعذّر الوصول إلى الخادم."""
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    r = urllib.request.Request(f"{BASE}/{path}", data=data, method=method,
                               headers={'Content-Type': 'application/json'})
    try:
        with opener.open(r, timeout=25) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return -1


def main():
    anon = client()
    s = {}
    for key, (user, pwd) in ACCOUNTS.items():
        s[key] = client()
        if req(s[key], 'POST', 'login.php', {'username': user, 'password': pwd}) != 200:
            print(f"تعذّر تسجيل الدخول بـ{user} — تأكّد أن الخادم يعمل وأن البذرة محمَّلة")
            return 1

    # (الوصف, الدور أو None للمجهول, الطريقة, المسار, الجسم, الرمز المتوقع)
    CASES = [
        ("طلب بلا جلسة",                  None,      'GET',    'issued/index.php?issued_id=1', None, 401),
        ("كلمة مرور خاطئة",               None,      'POST',   'login.php', {'username': 'admin@traffic.ly', 'password': 'خطأ'}, 401),
        ("رجل المرور يطلب التقارير",      'officer', 'GET',    'reports/index.php', None, 403),
        ("مركز الدفع ينشئ بند دليل",      'pay',     'POST',   'violations/index.php', {'violation_article': 'ف', 'violation_description': 'ف', 'fine_amount': 1}, 403),
        ("بحث رجل المرور بلا معيار",      'officer', 'GET',    'issued/index.php', None, 400),
        ("مدير النظام يبحث بلا معيار",    'admin',   'GET',    'issued/index.php', None, 200),
        ("استعلام عام لمخالفة قائمة",     None,      'GET',    'public/lookup.php?issued_id=1', None, 200),
        ("استعلام عام لرقم غير موجود",    None,      'GET',    'public/lookup.php?issued_id=904517', None, 404),
        ("استعلام عام برقم غير صالح",     None,      'GET',    'public/lookup.php?issued_id=abc', None, 400),
        ("دفع ذاتي لمخالفة مدفوعة",       None,      'POST',   'public/pay.php', {'issued_id': 1, 'payment_method': 'card'}, 409),
        ("دفع ذاتي نقدي ممنوع",           None,      'POST',   'public/pay.php', {'issued_id': 3, 'payment_method': 'cash'}, 400),
        ("مركز الدفع يدفع مدفوعة",        'pay',     'POST',   'payments/index.php', {'issued_id': 1, 'payment_method': 'cash'}, 409),
        ("تعديل مخالفة مدفوعة",           'admin',   'PUT',    'issued/index.php', {'issued_id': 1, 'violation_status': 'pending'}, 409),
        ("الحذف مرفوض بـ405",             'admin',   'DELETE', 'issued/index.php', {'issued_id': 1}, 405),
        ("تعديل مخالفة غير موجودة",       'admin',   'PUT',    'issued/index.php', {'issued_id': 904517, 'location': 'x'}, 404),
        ("حذف بند دليل مستخدَم",          'admin',   'DELETE', 'violations/index.php', {'violation_id': 1}, 409),
        ("إنشاء حساب بدور رجل مرور",      'admin',   'POST',   'users/index.php', {'username': 'zz_check', 'password': 'p1234567', 'role': 'officer'}, 400),
        ("مدير القسم يصل إلى البحث",      'dept',    'GET',    'issued/index.php?issued_id=4', None, 200),
        ("سجل الإيصالات لمدير النظام",    'admin',   'GET',    'receipts/index.php', None, 200),
        ("سجل الإيصالات لمدير القسم",     'dept',    'GET',    'receipts/index.php', None, 403),
        ("إصدار بلا معرّف مركبة",         'officer', 'POST',   'issued/index.php', {'violation_ids': [1]}, 400),
        ("إصدار ببند مكرر",               'officer', 'POST',   'issued/index.php', {'plate_no': 'ZZ-CHECK', 'violation_ids': [9, 9]}, 400),
    ]

    print("=" * 62)
    print("  فحص حواجز الخادم")
    print("=" * 62)
    passed = 0
    for name, role, method, path, body, expected in CASES:
        opener = anon if role is None else s[role]
        got = req(opener, method, path, body)
        ok = got == expected
        passed += ok
        print(f"  {'✓' if ok else '✗'} {name:32s} متوقع {expected:>4}   فعلي {got:>4}")

    failed = len(CASES) - passed
    print("-" * 62)
    print(f"  المجموع: {len(CASES)} | ناجح: {passed} | فاشل: {failed}")

    # ── تكامل قاعدة البيانات عبر التقارير ──
    print("\n" + "=" * 62)
    print("  تكامل البيانات")
    print("=" * 62)
    integrity_ok = True
    try:
        r = urllib.request.Request(f"{BASE}/reports/index.php", method='GET')
        with s['admin'].open(r, timeout=25) as resp:
            summary = json.loads(resp.read().decode()).get('summary', {})
        tickets = int(summary.get('tickets', 0))
        paid    = int(summary.get('paid', 0))
        pending = int(summary.get('pending', 0))
        total   = float(summary.get('total_fines', 0))
        coll    = float(summary.get('collected', 0))
        out     = float(summary.get('outstanding', 0))
        checks = [
            ("المدفوعة + المعلّقة = الإجمالي", paid + pending == tickets),
            ("المحصّل + المتبقي = إجمالي الغرامات", abs((coll + out) - total) < 0.01),
            ("لا مبالغ سالبة", coll >= 0 and out >= 0 and total >= 0),
        ]
        for name, ok in checks:
            integrity_ok &= ok
            print(f"  {'✓' if ok else '✗'} {name}")
        print(f"\n  تذاكر {tickets} · مدفوعة {paid} · معلّقة {pending} · "
              f"غرامات {total:.2f} · محصّل {coll:.2f} · متبقٍ {out:.2f}")
    except Exception as e:
        integrity_ok = False
        print(f"  ✗ تعذّر قراءة التقرير: {e}")

    print("\n" + "=" * 62)
    allok = failed == 0 and integrity_ok
    print("  النتيجة: " + ("كل الفحوص ناجحة" if allok else "يوجد فشل — راجع أعلاه"))
    return 0 if allok else 1


if __name__ == '__main__':
    sys.exit(main())
