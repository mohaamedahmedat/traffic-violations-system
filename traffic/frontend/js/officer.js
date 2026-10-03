
let user = null;

// ============================================
// موقع الضبط
// ============================================

function showLocationDisplay(loc) {
    document.getElementById('locationDisplayText').textContent = loc || 'اضغط لتحديد موقع الضبط';
    document.getElementById('locationDisplay').classList.toggle('saved', !!loc);
    document.getElementById('locationEdit').style.display    = 'none';
    document.getElementById('locationDisplay').style.display = 'flex';
}

function editLocation() {
    document.getElementById('location').value = localStorage.getItem('officer_location') || '';
    document.getElementById('locationDisplay').style.display = 'none';
    document.getElementById('locationEdit').style.display    = 'flex';
    // preventScroll: الحقل تحت إصبع المستخدم أصلاً — لا داعي لقفز الصفحة
    document.getElementById('location').focus({ preventScroll: true });
}

function saveLocation() {
    const loc = document.getElementById('location').value.trim();
    localStorage.setItem('officer_location', loc);
    showLocationDisplay(loc);
}

function loadSavedLocation() {
    showLocationDisplay(localStorage.getItem('officer_location'));
}

document.getElementById('location').addEventListener('keypress', e => {
    if (e.key === 'Enter') { e.preventDefault(); saveLocation(); }
});

// ============================================
// البحث عن مخالفات سابقة
// ============================================

function arabicUnit(n, singular, dual, plural) {
    if (n === 1) return singular;
    if (n === 2) return dual;
    if (n <= 10) return `${n} ${plural}`;
    return `${n} ${singular}`;
}

function formatElapsed(date, time) {
    if (!date) return '—';
    const issued = new Date(`${date}T${time || '00:00:00'}`);
    if (isNaN(issued.getTime())) return '—';

    let diff = Math.max(0, Date.now() - issued.getTime());
    const minute = 60000, hour = minute * 60, day = hour * 24;

    const days    = Math.floor(diff / day);   diff -= days  * day;
    const hours   = Math.floor(diff / hour);  diff -= hours * hour;
    const minutes = Math.floor(diff / minute);

    const parts = [];
    if (days  > 0) parts.push(arabicUnit(days,  'يوم',  'يومان',   'أيام'));
    if (hours > 0) parts.push(arabicUnit(hours, 'ساعة', 'ساعتان',  'ساعات'));
    if (days === 0 && hours === 0 && minutes > 0)
        parts.push(arabicUnit(minutes, 'دقيقة', 'دقيقتان', 'دقائق'));

    return parts.length === 0 ? 'أقل من دقيقة' : parts.slice(0, 2).join(' و');
}


// ============================================
// المخالفات — قائمة متعددة
// ============================================

let allViolations      = [];
let selectedViolations = [];   // مصفوفة المخالفات المضافة
let activeItemIndex    = -1;

function articleNumber(article) {
    const m = String(article || '').match(/\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : Infinity;
}

async function loadViolations() {
    const data = await Violations.getAll();
    allViolations = (data.data || []).slice().sort(
        (a, b) => articleNumber(a.violation_article) - articleNumber(b.violation_article)
    );
}

function renderViolationList(items) {
    const list = document.getElementById('violationList');
    activeItemIndex = -1;

    if (items.length === 0) {
        list.innerHTML = `<div class="combobox-empty">لا توجد نتائج مطابقة</div>`;
        list.classList.add('show');
        return;
    }

    list.innerHTML = items.map((v, i) => `
        <div class="combobox-item" data-index="${i}">
            <div class="cb-text">
                <span class="cb-desc">${escapeHtml(v.violation_description) || ''}</span>
                <span class="cb-article">${escapeHtml(v.violation_article) || ''}</span>
            </div>
            <span class="cb-amount">${v.fine_amount} د.ل</span>
        </div>
    `).join('');

    list.querySelectorAll('.combobox-item').forEach(el => {
        el.addEventListener('click', () => selectViolation(items[+el.dataset.index]));
    });

    list.classList.add('show');
}

function filterViolations(query) {
    const q = query.trim().toLowerCase();
    if (!q) return allViolations;
    return allViolations.filter(v =>
        (v.violation_article     || '').toLowerCase().includes(q) ||
        (v.violation_description || '').toLowerCase().includes(q)
    );
}

function selectViolation(v) {
    // لا تضيف مخالفة مكررة
    if (selectedViolations.some(s => s.violation_id === v.violation_id)) {
        document.getElementById('violation_search').value = '';
        hideViolationList();
        return;
    }
    selectedViolations.push(v);
    document.getElementById('violation_search').value = '';
    hideViolationList();
    renderViolationTags();
}

function removeViolation(index) {
    selectedViolations.splice(index, 1);
    renderViolationTags();
}

function renderViolationTags() {
    const container = document.getElementById('violationTags');
    if (selectedViolations.length === 0) {
        container.innerHTML = '';
        return;
    }

    const total = selectedViolations.reduce((s, v) => s + parseFloat(v.fine_amount || 0), 0);

    container.innerHTML = `
        <div class="vtags-list">
            ${selectedViolations.map((v, i) => `
                <div class="vtag">
                    <div class="vtag-text">
                        <span class="vtag-desc">${escapeHtml(v.violation_description) || ''}</span>
                        <span class="vtag-article">${escapeHtml(v.violation_article) || ''}</span>
                    </div>
                    <span class="vtag-amount">${v.fine_amount} د.ل</span>
                    <button class="vtag-remove" onclick="removeViolation(${i})" title="حذف">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            `).join('')}
        </div>
        <div class="vtags-total">
            <span>الإجمالي</span>
            <strong>${total.toFixed(2)} د.ل</strong>
        </div>
    `;
}

function clearViolationSelection() {
    selectedViolations = [];
    document.getElementById('violation_search').value = '';
    renderViolationTags();
}

document.getElementById('violation_search').addEventListener('input', e => {
    renderViolationList(filterViolations(e.target.value));
});

document.getElementById('violation_search').addEventListener('focus', e => {
    renderViolationList(filterViolations(e.target.value));
});

document.getElementById('violation_search').addEventListener('keydown', e => {
    const items = document.querySelectorAll('#violationList .combobox-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeItemIndex = Math.min(activeItemIndex + 1, items.length - 1);
        items.forEach((el, i) => el.classList.toggle('active', i === activeItemIndex));
        items[activeItemIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeItemIndex = Math.max(activeItemIndex - 1, 0);
        items.forEach((el, i) => el.classList.toggle('active', i === activeItemIndex));
        items[activeItemIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeItemIndex >= 0) items[activeItemIndex].click();
    } else if (e.key === 'Escape') {
        hideViolationList();
    }
});

function hideViolationList() {
    document.getElementById('violationList').classList.remove('show');
    activeItemIndex = -1;
}

document.addEventListener('click', e => {
    if (!document.getElementById('violationCombobox').contains(e.target)) {
        hideViolationList();
    }
});

// ============================================
// تنبيه تلقائي عند إدخال رقم اللوحة
// ============================================

let plateCheckTimeout = null;

// ============================================
// معرّف المركبة: لوحة أو رقم هيكل (مركبة بلا لوحات)
// ============================================

let vehicleIdMode = 'plate';   // 'plate' | 'chassis'

function setVehicleIdMode(mode) {
    vehicleIdMode = mode;
    const isPlate = mode === 'plate';

    document.getElementById('plateField').style.display   = isPlate ? '' : 'none';
    document.getElementById('chassisField').style.display = isPlate ? 'none' : '';

    document.querySelectorAll('#vehicleIdSwitch .id-opt').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === mode);
    });

    // الخانة المخفية تُفرَّغ حتى لا يُرسَل رقم من وضع سابق
    document.getElementById(isPlate ? 'chassis_no' : 'plate_no').value = '';
    document.getElementById('plateWarning').style.display = 'none';
    document.getElementById(isPlate ? 'plate_no' : 'chassis_no')
            .focus({ preventScroll: true });
}

document.querySelectorAll('#vehicleIdSwitch .id-opt').forEach(btn => {
    btn.addEventListener('click', () => setVehicleIdMode(btn.dataset.mode));
});

// الرقم المُدخَل حالياً أياً كان وضعه
function vehicleIdValue() {
    const id = vehicleIdMode === 'plate' ? 'plate_no' : 'chassis_no';
    return document.getElementById(id).value.trim();
}

// الحقلان يشتركان في نفس الفحص التلقائي
['plate_no', 'chassis_no'].forEach(id => {
    document.getElementById(id).addEventListener('input', function () {
        clearTimeout(plateCheckTimeout);
        const val = this.value.trim();

        if (!val || val.length < 2) {
            document.getElementById('plateWarning').style.display = 'none';
            return;
        }

        plateCheckTimeout = setTimeout(() => checkPlateWarning(val), 600);
    });
});

/* الخادم يطابق الرقم على عمودَي اللوحة والهيكل معاً، فالمركبة
   التي نُزعت لوحاتها لاحقاً يبقى احتمال العثور على سجلها. */
async function checkPlateWarning(plate) {
    const warning = document.getElementById('plateWarning');
    try {
        const data = await Issued.search({ plate_no: plate });

        const unpaid = (data.status === 'success' && data.data ? data.data : [])
            .filter(v => v.violation_status !== 'paid')
            .sort((a, b) => new Date(`${b.issued_date}T${b.issued_time || '00:00:00'}`) - new Date(`${a.issued_date}T${a.issued_time || '00:00:00'}`));

        if (unpaid.length === 0) {
            warning.style.display = 'none';
            return;
        }

        const title = document.getElementById('plateWarningTitle');
        title.textContent = `تنبيه: يوجد ${unpaid.length} مخالفة غير مدفوعة لهذه المركبة`;
        title.style.display = 'block';

        document.getElementById('plateWarningTable').innerHTML = unpaid.map(v => {
            const violations = v.violations || [];
            const desc = violations.length > 0
                ? violations.map(vl => escapeHtml(vl.violation_description || vl.violation_article)).join('، ')
                : '—';
            return `
            <tr>
                <td data-label="رقم المخالفة">${v.issued_id}</td>
                <td data-label="المخالفة">${desc}</td>
                <td data-label="الغرامة">${v.total_fine || '—'} د.ل</td>
                <td data-label="منذ">${formatElapsed(v.issued_date, v.issued_time)}</td>
                <td data-label="الحالة"><span class="badge badge-pending">غير مدفوعة</span></td>
            </tr>`;
        }).join('');

        warning.style.display = 'block';
    } catch (_) {
        // لا نقاطع عمل الضابط عند فشل الطلب
    }
}

// ============================================
// إصدار المخالفة
// ============================================

async function issueViolation() {
    const issueBtn   = document.querySelector('.btn-issue');
    if (issueBtn && issueBtn.disabled) return;

    const isPlate    = vehicleIdMode === 'plate';
    const plate_no   = isPlate ? vehicleIdValue() : '';
    const chassis_no = isPlate ? '' : vehicleIdValue();
    const license_no = document.getElementById('license_no').value.trim();

    if (!plate_no && !chassis_no) {
        showError(
            isPlate ? 'يرجى إدخال رقم اللوحة' : 'يرجى إدخال رقم الهيكل',
            isPlate ? 'plate_no' : 'chassis_no'
        );
        return;
    }

    if (selectedViolations.length === 0) {
        showError('يرجى إضافة مخالفة واحدة على الأقل', 'violation_search');
        return;
    }

    const { date, time } = getNow();
    const total = selectedViolations.reduce((s, v) => s + parseFloat(v.fine_amount || 0), 0);

    setLoading(issueBtn, true);
    try {
        const res = await Issued.create({
            driver_name:   document.getElementById('driver_name').value,
            driver_job:    document.getElementById('driver_job').value,
            license_no,
            license_class: document.getElementById('license_class').value,
            license_issue: document.getElementById('license_issue').value,
            identity_card: document.getElementById('identity_card').value,
            plate_no,
            chassis_no,
            vehicle_type:  document.getElementById('vehicle_type').value,
            location:      document.getElementById('location').value,
            issued_date:   date,
            issued_time:   time,
            violation_ids: selectedViolations.map(v => v.violation_id),
        });

        if (res.status !== 'success') {
            showMsg('errorMsg', res.message || 'حدث خطأ', 'error');
            return;
        }

        showMsg('successMsg', `تم إصدار المخالفة بنجاح — رقم المخالفة: ${res.id}`);

        printReceipt({
            issued_id:       res.id,
            date,
            time,
            driver_name:     document.getElementById('driver_name').value,
            driver_job:      document.getElementById('driver_job').value,
            license_no,
            license_class:   document.getElementById('license_class').value,
            license_issue:   document.getElementById('license_issue').value,
            identity_card:   document.getElementById('identity_card').value,
            plate_no,
            chassis_no,
            vehicle_type:    document.getElementById('vehicle_type').value,
            location:        document.getElementById('location').value,
            violations:      selectedViolations,
            total_fine:      total,
            officer_name:    user.officer_name,
            officer_rank:    user.officer_rank,
            officer_unit:    user.officer_unit,
            employee_no:     user.employee_no,
            license_section: user.license_section,
            traffic_chief:   user.traffic_chief,
            directorate:     user.directorate,
            department_name: user.department_name,
        });

        ['plate_no','chassis_no','license_no','license_class','identity_card',
         'vehicle_type','driver_name','driver_job','license_issue']
            .forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('plateWarning').style.display = 'none';
        clearViolationSelection();
        // التركيز يجهّز التذكرة التالية، والصفحة تبقى حيث تركها المُصدِر
        document.getElementById(isPlate ? 'plate_no' : 'chassis_no')
                .focus({ preventScroll: true });

    } catch (err) {
        showMsg('errorMsg', 'حدث خطأ أثناء إصدار المخالفة', 'error');
    } finally {
        setLoading(issueBtn, false);
    }
}

/* الرسالة تطفو أسفل الشاشة، والتركيز ينتقل إلى الحقل الناقص.
   preventScroll أساسي هنا: بدونه تقفز الصفحة إلى أعلى النموذج فور
   ظهور الإشعار، فيفقد المستخدم موضعه — وهو ما يجعل الإشعار مزعجاً
   بدل أن يكون مفيداً. */
function showError(msg, fieldId) {
    showMsg('errorMsg', msg, 'error');
    const f = document.getElementById(fieldId);
    if (f) f.focus({ preventScroll: true });
}

// ============================================
// طباعة الإيصال
// ============================================

function printReceipt(d) {
    const money = n => parseFloat(n || 0).toFixed(2);

    const has = v => (v === 0 || v) && String(v).trim() !== '';

    // اسم القسم يبدأ بنفس نص التسمية ("قسم ترخيص طرابلس" تحت تسمية "قسم ترخيص")
    // فتُقرأ مكرّرة. نُسقط البادئة المكرّرة ونُبقي المميِّز فقط.
    const strip = (v, prefix) => {
        if (!has(v)) return v;
        const s = String(v).trim();
        return s.startsWith(prefix) ? s.slice(prefix.length).trim() : s;
    };

    // حقل النموذج — يُحذف كلياً إن كانت قيمته فارغة بدل طباعة سطر بلا معنى
    const fld = (lbl, v) => has(v)
        ? `<div class="fl"><span class="fl-l">${lbl} :</span><span class="fl-v">${v}</span></div>`
        : '';

    // بند مخالفة: نص المخالفة ثم المادة ثم الغرامة
    const vRows = (d.violations || []).map((v, i) => `
        <div class="vb">
            <div class="vb-t">${i + 1}. ${escapeHtml(v.violation_description) || '—'}</div>
            <div class="fl"><span class="fl-l">خلافاً لنص المادة :</span><span class="fl-v">${escapeHtml(v.violation_article) || '—'}</span></div>
            <div class="vb-f"><span>الغرامة</span><b>${money(v.fine_amount)} د.ل</b></div>
        </div>`).join('');

    const area = document.getElementById('receiptArea');
    area.innerHTML = `
<style>
/* ============================================================
   إيصال حراري — Sunmi V2 · ورق 58مم · عرض الطباعة 48مم · 203dpi
   مبني على نموذج "تقرير مخالفة مرور — إيصال سحب مستندات" الرسمي
   أحادي اللون: لا خلفيات داكنة (الحرارية تحرقها كتلاً سوداء)
   ============================================================ */
.tr {
    width: 48mm;
    margin: 0 auto;
    padding: 2mm 0 3mm;
    box-sizing: border-box;
    direction: rtl;
    text-align: right;
    color: #000;
    background: #fff;
    font-family: 'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif;
    font-size: 8.4pt;
    line-height: 1.42;
    -webkit-font-smoothing: none;
}
.tr * { box-sizing: border-box; }

/* الترويسة الرسمية */
.hd   { text-align: center; }
.hd-1 { font-size: 9.6pt; font-weight: 700; }
.hd-2 { font-size: 8pt; line-height: 1.35; }

/* عنوان المستند */
.ttl  { text-align: center; font-weight: 700; font-size: 10pt; line-height: 1.35; margin: 0.6mm 0; }

/* الرقم المسلسل — يقابل الرقم الأحمر المطبوع في النموذج */
.serial { text-align: center; font-size: 12pt; font-weight: 700; margin: 0.8mm 0; letter-spacing: 0.3px; }

/* الفواصل: المتقطّع يحرق نصف نقاط الخط المصمت.
   خُفِّض الفاصل الرئيسي من 2px إلى 1px — نفس التمييز بنصف الحرق. */
.sep  { border-top: 1px dashed #000; margin: 1.1mm 0; }
.sep2 { border-top: 1px solid #000; margin: 1.1mm 0; }

/* حقل النموذج: التسمية يميناً ثم القيمة.
   بلا خطوط منقّطة تحت القيم — كانت زخرفية بحتة، وكل نقطة تعني
   نقطة تُحرَق في رأس الطباعة: حرارة أعلى وتآكل أسرع. */
.fl { display: flex; align-items: baseline; gap: 1.2mm; margin-bottom: 0.5mm; }
.fl-l { flex-shrink: 0; }
.fl-v { flex: 1; font-weight: 700; text-align: right; word-break: break-word; }

/* صندوق رقم المركبة كما في النموذج */
.plate-w { margin: 1mm 0; text-align: center; }
.plate-l { font-size: 8pt; margin-bottom: 0.6mm; }
.plate-b { display: inline-block; border: 1.5px solid #000; padding: 0.8mm 3mm;
           font-size: 12pt; font-weight: 700; letter-spacing: 1px; }

/* بنود المخالفات */
.vb { margin-bottom: 1.4mm; }
.vb-t { font-weight: 700; font-size: 8.4pt; line-height: 1.4; margin-bottom: 0.4mm; }
.vb-f { display: flex; justify-content: space-between; font-size: 8.4pt; }
.vb-f b { font-variant-numeric: tabular-nums; }

/* الإجمالي */
.tot { display: flex; justify-content: space-between; align-items: baseline;
       font-weight: 700; font-size: 11pt; }
.tot b { font-variant-numeric: tabular-nums; }
.wrd { font-size: 7.8pt; text-align: center; margin-top: 0.6mm; line-height: 1.45; }

/* التوقيع — فراغ للتوقيع اليدوي فوق خط واحد رفيع */
.sig   { text-align: center; margin-top: 1.5mm; }
.sig-sp{ height: 7mm; }
.sig-l { border-top: 1px solid #000; margin: 0 6mm; padding-top: 0.7mm; font-size: 7.8pt; }

/* التذييل */
.rev { text-align: center; font-weight: 700; font-size: 8.4pt; margin-top: 1mm; }
.ft  { text-align: center; font-size: 7.4pt; margin-top: 1mm; line-height: 1.5; }

@media print {
    /* بكرة مستمرة: الارتفاع تلقائي وبلا هوامش */
    @page { size: 58mm auto; margin: 0; }
    html, body { width: 58mm; margin: 0; padding: 0; background: #fff; }
    /* محصورة بالصنف الذي تضيفه printReceiptArea() — هذه الكتلة تبقى في
       الـ DOM بعد أول طباعة، فبلا الحصر تتصرّف في كل طباعة لاحقة. */
    body.printing-receipt > *:not(#receiptArea) { display: none !important; }
    body.printing-receipt #receiptArea { display: block !important; font-family: inherit; font-size: inherit; }
    .tr { width: 48mm; }
}
</style>
<div class="tr">

    <div class="hd">
        <div class="hd-1">وزارة الداخلية</div>
        <div class="hd-2">الإدارة العامة للمرور والتراخيص</div>
    </div>

    <div class="sep"></div>

    ${fld('قسم ترخيص', strip(escapeHtml(d.license_section), 'قسم ترخيص'))}

    <div class="ttl">تقرير مخالفة مرور</div>
    <div class="serial">رقم المخالفة ${d.issued_id}</div>

    <div class="sep2"></div>

    ${fld('إلى رئيس قسم مرور', strip(escapeHtml(d.department_name), 'قسم مرور'))}
    ${fld('أنا', escapeHtml(d.officer_name))}
    ${fld('الرتبة', escapeHtml(d.officer_rank))}
    ${fld('الرقم', escapeHtml(d.employee_no))}
    ${fld('التابع', escapeHtml(d.officer_unit))}
    ${fld('بتاريخ', d.date)}
    ${fld('الساعة', formatTime12(d.time))}
    ${fld('الجهة', escapeHtml(d.location))}

    <div class="sep"></div>

    <div class="plate-w">
        <div class="plate-l">${has(d.plate_no) ? 'ضبطت المركبة رقم' : 'ضبطت المركبة — رقم الهيكل'}</div>
        <div class="plate-b">${escapeHtml(has(d.plate_no) ? d.plate_no : d.chassis_no) || '—'}</div>
    </div>
    ${fld('النوع', escapeHtml(d.vehicle_type))}
    ${fld('بقيادة', escapeHtml(d.driver_name))}
    ${fld('مهنته', escapeHtml(d.driver_job))}
    ${fld('رخصة قيادة رقم', escapeHtml(d.license_no))}
    ${fld('فئة', escapeHtml(d.license_class))}
    ${fld('الإصدار', escapeHtml(d.license_issue))}
    ${fld('بطاقة شخصية', escapeHtml(d.identity_card))}

    <div class="sep"></div>

    <div class="vb-t" style="margin-bottom:1mm">وخالف نظم المرور بأن :</div>
    ${vRows}

    <div class="sep2"></div>

    <div class="tot"><span>الإجمالي</span><b>${money(d.total_fine)} د.ل</b></div>
    <div class="wrd">${numberToArabic(Math.floor(d.total_fine))} ديناراً فقط لا غير</div>

    <div class="sep2"></div>

    <div class="sig">
        <div class="sig-sp"></div>
        <div class="sig-l">توقيع محرر المخالفة</div>
    </div>

    <div class="rev">— المراجعة خلال 72 ساعة —</div>
    <div class="ft">
        تُسدَّد لدى أقرب مركز دفع<br>
        أو إلكترونياً برقم المخالفة
    </div>

</div>`;
    printReceiptArea(400);
}

// ============================================
// تهيئة الصفحة
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    user = await requireRole('officer');
    if (!user) return;
    renderNavbarInfo(user);
    loadViolations();
    loadSavedLocation();
});
