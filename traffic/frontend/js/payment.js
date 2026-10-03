
let user = null;
let currentViolation = null;
let selectedMethod   = null;

// ============================================
// البحث
// ============================================

async function searchViolation() {
    const issued_id  = document.getElementById('s_issued_id').value.trim();
    const license_no = document.getElementById('s_license_no').value.trim();
    const plate_no   = document.getElementById('s_plate_no').value.trim();
    const btn        = document.getElementById('searchPayBtn');

    if (!issued_id && !license_no && !plate_no) {
        return showMsg('searchMsg', 'يرجى إدخال أحد معايير البحث', 'error');
    }

    if (btn && btn.disabled) return;

    setLoading(btn, true);
    try {
        const data = await Issued.search({ issued_id, license_no, plate_no });

        if (data.status !== 'success' || !data.data || data.data.length === 0) {
            showMsg('searchMsg', 'لم يتم العثور على أي مخالفة', 'error');
            document.getElementById('violationInfo').style.display = 'none';
            return;
        }

        currentViolation = data.data[0];
        showViolation(currentViolation);

    } catch (err) {
        showMsg('searchMsg', 'حدث خطأ أثناء البحث', 'error');
    } finally {
        setLoading(btn, false);
    }
}

// ============================================
// عرض المخالفة
// ============================================

function showViolation(v) {
    document.getElementById('violationInfo').style.display = 'block';
    document.getElementById('r_issued_id').textContent     = v.issued_id;
    document.getElementById('r_date').textContent          = v.issued_date      || '—';
    document.getElementById('r_driver').textContent        = v.driver_name      || '—';
    document.getElementById('r_identity_card').textContent = v.identity_card    || '—';
    // المركبة بلا لوحات: تُعرض بهيكلها والتسمية تتبع ما هو موجود فعلاً
    const hasPlate = v.plate_no && String(v.plate_no).trim() !== '';
    document.getElementById('r_plate_label').textContent   = hasPlate ? 'رقم اللوحة' : 'رقم الهيكل';
    document.getElementById('r_plate').textContent         = (hasPlate ? v.plate_no : v.chassis_no) || '—';
    document.getElementById('r_vehicle').textContent       = v.vehicle_type     || '—';
    document.getElementById('r_license').textContent       = v.license_no       || '—';
    document.getElementById('r_class').textContent         = v.license_class    || '—';
    document.getElementById('r_location').textContent      = v.location         || '—';
    const violations = v.violations || [];
    document.getElementById('r_violations_list').innerHTML = violations.length > 0
        ? violations.map(vl => `
            <div class="violation-row">
                <div class="violation-article">${escapeHtml(vl.violation_article) || '—'}</div>
                <div class="violation-desc">${escapeHtml(vl.violation_description) || '—'}</div>
                <div class="violation-fine">${vl.fine_amount} د.ل</div>
            </div>`).join('')
        : '<div class="violation-desc">—</div>';
    document.getElementById('r_officer').textContent    = v.officer_name    || '—';
    document.getElementById('r_department').textContent = v.department_name || '—';
    document.getElementById('r_amount').textContent     = (v.total_fine || 0) + ' د.ل';

    const isPaid = v.violation_status === 'paid';
    document.getElementById('paidBadge').style.display      = isPaid ? 'block' : 'none';
    document.getElementById('paymentSection').style.display = isPaid ? 'none'  : 'block';
}

// ============================================
// اختيار طريقة الدفع
// ============================================

function selectMethod(method) {
    selectedMethod = method;
    document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('m_' + method).classList.add('selected');
}

// ============================================
// تسجيل الدفع
// ============================================

async function processPayment() {
    const payBtn = document.getElementById('processPayBtn');
    if (payBtn && payBtn.disabled) return;

    if (!selectedMethod) {
        return showMsg('payMsg', 'يرجى اختيار طريقة الدفع', 'error');
    }

    const { date, time } = getNow();

    setLoading(payBtn, true);
    try {
        const res = await Payments.create({
            issued_id:      currentViolation.issued_id,
            payment_method: selectedMethod,
        });

        if (res.status === 'success') {
            showMsg('payMsg', 'تم تسجيل الدفع بنجاح');
            document.getElementById('paymentSection').style.display = 'none';
            document.getElementById('paidBadge').style.display      = 'block';
            printReceipt(date, time);
        } else {
            showMsg('payMsg', res.message || 'حدث خطأ أثناء تسجيل الدفع', 'error');
        }

    } catch (err) {
        showMsg('payMsg', 'حدث خطأ أثناء تسجيل الدفع', 'error');
    } finally {
        setLoading(payBtn, false);
    }
}

// ============================================
// طباعة الإيصال
// ============================================

function printReceipt(date, time) {
    const v          = currentViolation;
    const violations = v.violations || [];
    const amt        = parseFloat(v.total_fine || 0);

    const violationsRows = violations.map(vl => `
        <tr>
            <td style="padding:4px 8px; border:1px solid #ccc">${escapeHtml(vl.violation_article) || '—'}</td>
            <td style="padding:4px 8px; border:1px solid #ccc">${escapeHtml(vl.violation_description) || '—'}</td>
            <td style="padding:4px 8px; border:1px solid #ccc; text-align:left">${vl.fine_amount} د.ل</td>
        </tr>`).join('');

    const area = document.getElementById('receiptArea');
    area.innerHTML = `
        <div style="text-align:center; border-bottom:2px solid #000; padding-bottom:10px; margin-bottom:15px;">
            <h2 style="font-size:16px">إيصال استلام نقود</h2>
            <p>نظام المخالفات المرورية</p>
        </div>
        <div style="margin-bottom:10px; padding:10px; border:1px solid #000;">
            <p><strong>اسم المخالف:</strong> ${escapeHtml(v.driver_name) || '—'}</p>
            <p><strong>رقم البطاقة الشخصية:</strong> ${escapeHtml(v.identity_card) || '—'}</p>
            <p><strong>${v.plate_no ? 'رقم اللوحة' : 'رقم الهيكل'}:</strong> ${escapeHtml(v.plate_no || v.chassis_no) || '—'}</p>
            <p><strong>رقم رخصة القيادة:</strong> ${escapeHtml(v.license_no) || '—'} &nbsp;&nbsp; <strong>الفئة:</strong> ${escapeHtml(v.license_class) || '—'}</p>
        </div>
        <div style="margin-bottom:10px; padding:10px; border:1px solid #000;">
            <p><strong>رقم المخالفة:</strong> ${v.issued_id}</p>
            <table style="width:100%; border-collapse:collapse; margin-top:8px">
                <thead>
                    <tr>
                        <th style="padding:4px 8px; border:1px solid #ccc; background:#f5f5f5">المادة</th>
                        <th style="padding:4px 8px; border:1px solid #ccc; background:#f5f5f5">المخالفة</th>
                        <th style="padding:4px 8px; border:1px solid #ccc; background:#f5f5f5">الغرامة</th>
                    </tr>
                </thead>
                <tbody>${violationsRows}</tbody>
            </table>
        </div>
        <div style="margin-bottom:10px; padding:10px; border:2px solid #000; text-align:center;">
            <p style="font-size:15px"><strong>المبلغ بالأرقام:</strong> ${amt} د.ل</p>
            <p style="font-size:15px"><strong>المبلغ بالحروف:</strong> ${numberToArabic(amt)} دينار ليبي</p>
            <p><strong>طريقة الدفع:</strong> ${methodNames[selectedMethod]}</p>
        </div>
        <div style="padding:10px; border:1px solid #000;">
            <p><strong>اسم المستخدم:</strong> ${escapeHtml(user.username) || '—'}</p>
            <p><strong>الجهة التابع لها:</strong> ${escapeHtml(user.directorate || user.department_name) || '—'}</p>
            <p><strong>التاريخ:</strong> ${date} &nbsp;&nbsp; <strong>الساعة:</strong> ${time}</p>
        </div>
    `;
    printReceiptArea(500);
}

document.addEventListener('keypress', e => {
    if (e.key === 'Enter') searchViolation();
});

document.addEventListener('DOMContentLoaded', async () => {
    user = await requireRole('payment_center');
    if (!user) return;
    renderNavbarInfo(user);
});
