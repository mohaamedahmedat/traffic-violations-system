let currentViolation = null;
let selectedPayTab   = 'card';
let lastPaymentMethod = 'card';

// ============================================
// البحث
// ============================================

async function searchViolation() {
    const issued_id = document.getElementById('s_issued_id').value.trim();
    const searchBtn = document.getElementById('searchBtn');

    if (!issued_id) {
        return showMsg('searchMsg', 'يرجى إدخال رقم المخالفة', 'error');
    }

    setLoading(searchBtn, true);
    try {
        const data = await Public.lookup(issued_id);

        if (data.status !== 'success') {
            showMsg('searchMsg', data.message || 'لم يتم العثور على مخالفة بهذا الرقم', 'error');
            document.getElementById('violationResult').style.display = 'none';
            return;
        }

        currentViolation = data.data;
        showViolation(currentViolation);

    } catch (err) {
        showMsg('searchMsg', 'حدث خطأ أثناء البحث', 'error');
    } finally {
        setLoading(searchBtn, false);
    }
}

// ============================================
// عرض المخالفة
// ============================================

function showViolation(v) {
    document.getElementById('violationResult').style.display = 'block';

    const isPaid = v.violation_status === 'paid';
    document.getElementById('statusBadge').innerHTML = isPaid
        ? `<span class="badge badge-paid" style="font-size:13px; padding:6px 16px">${Icons.check} مدفوعة</span>`
        : `<span class="badge badge-pending" style="font-size:13px; padding:6px 16px">${Icons.clock} غير مدفوعة</span>`;

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
    document.getElementById('r_amount').textContent = (v.total_fine || 0) + ' د.ل';
    document.getElementById('payBtn').style.display        = isPaid ? 'none' : 'block';
}

// ============================================
// نافذة الدفع
// ============================================

function showPayModal() {
    document.getElementById('payModal').classList.add('show');
    document.getElementById('payForm').style.display    = 'block';
    document.getElementById('successAnim').style.display = 'none';
    showPayTab('card');
}

function closeModal() {
    document.getElementById('payModal').classList.remove('show');
}

function showPayTab(tab) {
    selectedPayTab = tab;
    lastPaymentMethod = tab;
    document.querySelectorAll('.pay-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.pay-form').forEach(f => f.classList.remove('active'));
    document.getElementById('tab_'  + tab).classList.add('active');
    document.getElementById('form_' + tab).classList.add('active');
}

// ============================================
// تأكيد الدفع
// ============================================

async function confirmPayment() {
    const confirmBtn = document.getElementById('confirmPayBtn');
    if (confirmBtn && confirmBtn.disabled) return;
    setLoading(confirmBtn, true);
    try {
        const res = await Public.pay({
            issued_id:      currentViolation.issued_id,
            payment_method: selectedPayTab,
        });

        if (res.status !== 'success') {
            alert(res.message || 'حدث خطأ أثناء تسجيل الدفع');
            return;
        }

        document.getElementById('s_issued_result').textContent    = currentViolation.issued_id;
        document.getElementById('payForm').style.display          = 'none';
        document.getElementById('successAnim').style.display      = 'block';
        document.getElementById('payBtn').style.display           = 'none';
        document.getElementById('statusBadge').innerHTML =
            `<span class="badge badge-paid" style="font-size:13px; padding:6px 16px">${Icons.check} مدفوعة</span>`;

    } catch (err) {
        alert('حدث خطأ أثناء تسجيل الدفع');
    } finally {
        setLoading(confirmBtn, false);
    }
}

function printPublicReceipt() {
    const v = currentViolation;
    const violations = v.violations || [];
    const methodNames = { cash: 'نقداً', card: 'بطاقة مصرفية', libyana: 'كروت ليبيانا', sadad: 'سداد' };

    const violationsRows = violations.map(vl => `
        <tr>
            <td style="padding:5px 8px; border:1px solid #ccc">${escapeHtml(vl.violation_article) || '—'}</td>
            <td style="padding:5px 8px; border:1px solid #ccc">${escapeHtml(vl.violation_description) || '—'}</td>
            <td style="padding:5px 8px; border:1px solid #ccc; text-align:left">${vl.fine_amount} د.ل</td>
        </tr>
    `).join('');

    const now  = new Date();
    const date = now.toLocaleDateString('ar-LY');
    const time = now.toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' });

    const area = document.getElementById('receiptArea');
    area.innerHTML = `
        <div style="max-width:600px; margin:0 auto; font-family:Arial,sans-serif; direction:rtl; padding:20px">
            <div style="text-align:center; border-bottom:2px solid #000; padding-bottom:12px; margin-bottom:16px">
                <h2 style="font-size:18px; margin:0">نظام إدارة المخالفات المرورية</h2>
                <h3 style="font-size:14px; margin:6px 0">إيصال دفع إلكتروني</h3>
            </div>
            <table style="width:100%; border-collapse:collapse; margin-bottom:16px">
                <tr>
                    <td style="padding:4px 8px; width:50%"><strong>رقم المخالفة:</strong> ${v.issued_id}</td>
                    <td style="padding:4px 8px"><strong>تاريخ الدفع:</strong> ${date}</td>
                </tr>
                <tr>
                    <td style="padding:4px 8px"><strong>وقت الدفع:</strong> ${time}</td>
                    <td style="padding:4px 8px"><strong>طريقة الدفع:</strong> ${methodNames[lastPaymentMethod] || lastPaymentMethod}</td>
                </tr>
                <tr>
                    <td style="padding:4px 8px"><strong>اسم السائق:</strong> ${escapeHtml(v.driver_name) || '—'}</td>
                    <td style="padding:4px 8px"><strong>رقم البطاقة:</strong> ${escapeHtml(v.identity_card) || '—'}</td>
                </tr>
                <tr>
                    <td style="padding:4px 8px"><strong>${v.plate_no ? 'رقم اللوحة' : 'رقم الهيكل'}:</strong> ${escapeHtml(v.plate_no || v.chassis_no) || '—'}</td>
                    <td style="padding:4px 8px"><strong>نوع المركبة:</strong> ${escapeHtml(v.vehicle_type) || '—'}</td>
                </tr>
                <tr>
                    <td style="padding:4px 8px"><strong>رقم الرخصة:</strong> ${escapeHtml(v.license_no) || '—'}</td>
                    <td style="padding:4px 8px"><strong>فئة الرخصة:</strong> ${escapeHtml(v.license_class) || '—'}</td>
                </tr>
            </table>
            <table style="width:100%; border-collapse:collapse; margin-bottom:16px">
                <thead>
                    <tr style="background:#f5f5f5">
                        <th style="padding:5px 8px; border:1px solid #ccc">المادة</th>
                        <th style="padding:5px 8px; border:1px solid #ccc">المخالفة</th>
                        <th style="padding:5px 8px; border:1px solid #ccc">الغرامة</th>
                    </tr>
                </thead>
                <tbody>${violationsRows}</tbody>
            </table>
            <div style="text-align:center; border:2px solid #000; padding:10px; font-size:16px; font-weight:bold; margin-bottom:16px">
                إجمالي المبلغ المدفوع: ${v.total_fine} د.ل
            </div>
            <div style="text-align:center; color:#666; font-size:12px; border-top:1px solid #ccc; padding-top:10px">
                <p>الحالة: <strong style="color:green">مدفوعة</strong></p>
                <p>هذا الإيصال يُعدّ وثيقة رسمية لإثبات سداد المخالفة</p>
            </div>
        </div>
    `;
    printReceiptArea(300);
}

document.addEventListener('keypress', e => {
    if (e.key === 'Enter') searchViolation();
});
