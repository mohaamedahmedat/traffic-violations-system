// ============================================
// ADMIN.JS — مدير النظام
// ============================================

// ============================================
// الأقسام
// ============================================

let deptMap = {};

async function loadDepartments() {
    const tb = document.getElementById('departmentsTable');
    let data;
    try {
        data = await Departments.getAll();
    } catch (_) {
        tb.innerHTML = '<tr><td class="empty-row" colspan="9">حدث خطأ في الاتصال بالخادم</td></tr>';
        return;
    }
    if (data.status !== 'success') {
        tb.innerHTML = '<tr><td class="empty-row" colspan="9">حدث خطأ في تحميل البيانات</td></tr>';
        return;
    }
    deptMap = {};
    tb.innerHTML = (data.data || []).map(d => {
        deptMap[d.department_id] = d;
        const active = d.is_active == 1;
        return `
        <tr>
            <td data-label="#">${d.department_id}</td>
            <td data-label="اسم القسم">${escapeHtml(d.department_name) || '—'}</td>
            <td data-label="قسم الترخيص">${escapeHtml(d.license_section) || '—'}</td>
            <td data-label="رئيس القسم">${escapeHtml(d.traffic_chief) || '—'}</td>
            <td data-label="المديرية">${escapeHtml(d.directorate) || '—'}</td>
            <td data-label="الموقع">${escapeHtml(d.location) || '—'}</td>
            <td data-label="اسم المستخدم">${escapeHtml(d.admin_username) || '—'}</td>
            <td data-label="الحالة">
                <span class="badge ${active ? 'badge-paid' : 'badge-pending'}">
                    ${active ? Icons.check + ' نشط' : Icons.cross + ' غير نشط'}
                </span>
            </td>
            <td data-label="إجراءات" style="white-space:nowrap">
                <button class="btn btn-ghost" onclick="openEditDept(${d.department_id})" style="margin-left:4px">تعديل</button>
                <button class="btn ${active ? 'btn-danger' : 'btn-success'}"
                        onclick="toggleDepartment(${d.department_id}, ${active ? 1 : 0})">
                    ${active ? 'إلغاء التنشيط' : 'تنشيط'}
                </button>
            </td>
        </tr>`;
    }).join('') || '<tr><td class="empty-row" colspan="9">لا توجد أقسام</td></tr>';
}

function openEditDept(id) {
    const d = deptMap[id];
    if (!d) return;
    document.getElementById('ed_id').value          = d.department_id;
    document.getElementById('ed_name').value        = d.department_name || '';
    document.getElementById('ed_license').value     = d.license_section || '';
    document.getElementById('ed_chief').value       = d.traffic_chief   || '';
    document.getElementById('ed_directorate').value = d.directorate     || '';
    document.getElementById('ed_location').value    = d.location        || '';
    document.getElementById('ed_username').value    = d.admin_username  || '';
    document.getElementById('ed_password').value    = '';
    document.getElementById('edMsg').style.display  = 'none';
    document.getElementById('editDeptModal').classList.add('show');
}

async function saveDept() {
    const btn  = document.querySelector('#editDeptModal .btn-primary');
    const name = document.getElementById('ed_name').value.trim();

    if (!name) return showMsg('edMsg', 'اسم القسم مطلوب', 'error');

    setLoading(btn, true);
    try {
        const res = await Departments.update({
            department_id:   parseInt(document.getElementById('ed_id').value),
            department_name: name,
            license_section: document.getElementById('ed_license').value.trim(),
            traffic_chief:   document.getElementById('ed_chief').value.trim(),
            directorate:     document.getElementById('ed_directorate').value.trim(),
            location:        document.getElementById('ed_location').value.trim(),
            username:        document.getElementById('ed_username').value.trim(),
            password:        document.getElementById('ed_password').value,
        });
        if (res.status !== 'success') return showMsg('edMsg', res.message || 'فشل التعديل', 'error');
        closeModal('editDeptModal');
        showMsg('dMsg', 'تم تعديل القسم بنجاح');
        await loadDepartments();
    } catch (_) {
        showMsg('edMsg', 'حدث خطأ في الاتصال بالخادم', 'error');
    } finally {
        setLoading(btn, false);
    }
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

async function addDepartment() {
    const name            = document.getElementById('d_name').value.trim();
    const license_section = document.getElementById('d_license_section').value.trim();
    const traffic_chief   = document.getElementById('d_traffic_chief').value.trim();
    const directorate     = document.getElementById('d_directorate').value.trim();
    const location        = document.getElementById('d_location').value.trim();
    const username        = document.getElementById('d_username').value.trim();
    const password        = document.getElementById('d_password').value.trim();

    if (!name || !username || !password) {
        return showMsg('dMsg', 'يرجى تعبئة اسم القسم واسم المستخدم وكلمة المرور', 'error');
    }

    const btn = document.querySelector('#tab-departments .btn-primary');
    setLoading(btn, true);
    try {
        const res = await Departments.create({
            department_name: name, license_section, traffic_chief, directorate, location, username, password
        });
        if (res.status === 'success') {
            showMsg('dMsg', 'تم إنشاء القسم وحساب المدير بنجاح');
            ['d_name','d_license_section','d_traffic_chief','d_directorate','d_location','d_username','d_password']
                .forEach(id => { document.getElementById(id).value = ''; });
            await loadDepartments();
        } else {
            showMsg('dMsg', res.message || 'فشل إنشاء القسم', 'error');
        }
    } catch (_) {
        showMsg('dMsg', 'حدث خطأ في الاتصال بالخادم', 'error');
    } finally {
        setLoading(btn, false);
    }
}

/* تنشيط / إلغاء تنشيط — لا حذف.
   السجل وعلاقاته بالضباط والمخالفات تبقى كما هي. */
async function toggleDepartment(id, currentlyActive) {
    const turningOff = currentlyActive == 1;
    const d = deptMap[id];
    const label = d ? d.department_name : 'القسم';

    const confirmMsg = turningOff
        ? `إلغاء تنشيط «${label}»؟\nلن يتمكن مدير القسم وضباطه ومراكز الدفع التابعة له من تسجيل الدخول.\nلن تُحذف أي بيانات ويمكن التنشيط مجدداً.`
        : `تنشيط «${label}»؟\nسيستعيد تابعوه إمكانية تسجيل الدخول.`;

    if (!confirm(confirmMsg)) return;

    try {
        const res = await Departments.setActive(id, !turningOff);
        if (res.status !== 'success') return showMsg('dMsg', res.message || 'فشل تغيير الحالة', 'error');
        showMsg('dMsg', res.message);
        await loadDepartments();
    } catch (_) {
        showMsg('dMsg', 'حدث خطأ في الاتصال بالخادم', 'error');
    }
}

// ============================================
// المخالفات القانونية
// ============================================

let violationMap = {};

async function loadViolations() {
    const tb = document.getElementById('violationsTable');
    let data;
    try {
        data = await Violations.getAll();
    } catch (_) {
        tb.innerHTML = '<tr><td class="empty-row" colspan="5">حدث خطأ في الاتصال بالخادم</td></tr>';
        return;
    }
    if (data.status !== 'success') {
        tb.innerHTML = '<tr><td class="empty-row" colspan="5">حدث خطأ في تحميل البيانات</td></tr>';
        return;
    }
    violationMap = {};
    tb.innerHTML = (data.data || []).map(v => {
        violationMap[v.violation_id] = v;
        return `
        <tr>
            <td data-label="#">${v.violation_id}</td>
            <td data-label="المادة">${escapeHtml(v.violation_article) || '—'}</td>
            <td data-label="الوصف">${escapeHtml(v.violation_description) || '—'}</td>
            <td data-label="قيمة الغرامة">${v.fine_amount} د.ل</td>
            <td data-label="إجراءات" style="white-space:nowrap">
                <button class="btn btn-ghost" onclick="openEditViolation(${v.violation_id})" style="margin-left:4px">تعديل</button>
                <button class="btn btn-danger" onclick="deleteViolation(${v.violation_id})">حذف</button>
            </td>
        </tr>`;
    }).join('') || '<tr><td class="empty-row" colspan="5">لا توجد مخالفات قانونية</td></tr>';
}

function openEditViolation(id) {
    const v = violationMap[id];
    if (!v) return;
    document.getElementById('ev_id').value          = v.violation_id;
    document.getElementById('ev_article').value     = v.violation_article     || '';
    document.getElementById('ev_description').value = v.violation_description || '';
    document.getElementById('ev_amount').value      = v.fine_amount           || '';
    document.getElementById('editViolationModal').classList.add('show');
}

async function saveViolation() {
    const btn = document.querySelector('#editViolationModal .btn-primary');
    setLoading(btn, true);
    try {
        const res = await Violations.update({
            violation_id:          parseInt(document.getElementById('ev_id').value),
            violation_article:     document.getElementById('ev_article').value.trim(),
            violation_description: document.getElementById('ev_description').value.trim(),
            fine_amount:           parseFloat(document.getElementById('ev_amount').value),
        });
        if (res.status !== 'success') return showMsg('vMsg', res.message || 'فشل التعديل', 'error');
        closeModal('editViolationModal');
        showMsg('vMsg', 'تم تعديل المخالفة بنجاح');
        await loadViolations();
    } finally {
        setLoading(btn, false);
    }
}

async function addViolation() {
    const article     = document.getElementById('v_article').value.trim();
    const description = document.getElementById('v_description').value.trim();
    const amount      = document.getElementById('v_amount').value.trim();
    if (!article || !amount) return showMsg('vMsg', 'يرجى تعبئة المادة والقيمة', 'error');
    const btn = document.querySelector('#tab-violations .btn-primary');
    setLoading(btn, true);
    let res;
    try {
        res = await Violations.create({ violation_article: article, violation_description: description, fine_amount: amount });
    } finally {
        setLoading(btn, false);
    }
    if (res.status !== 'success') return showMsg('vMsg', res.message || 'حدث خطأ', 'error');
    document.getElementById('v_article').value     = '';
    document.getElementById('v_description').value = '';
    document.getElementById('v_amount').value      = '';
    showMsg('vMsg', 'تمت الإضافة بنجاح');
    await loadViolations();
}

async function deleteViolation(id) {
    if (!confirm('هل أنت متأكد من الحذف؟')) return;
    try {
        const res = await Violations.delete(id);
        if (res.status !== 'success') return showMsg('vMsg', res.message || 'فشل الحذف', 'error');
        await loadViolations();
    } catch (_) {
        showMsg('vMsg', 'حدث خطأ في الاتصال بالخادم', 'error');
    }
}

// ============================================
// المخالفات الصادرة — FR-19
// ============================================

let issuedMap = {};

/** اللوحة أو الهيكل كنصّ صِرف — للحوارات ونوافذ التأكيد.
    الاسم مميَّز عمداً: reports.js فيه vehicleId() تُرجع HTML موسوماً،
    وهي المستعملة في خلايا الجداول. تسمية الاثنتين بالاسم نفسه كانت
    تجعل هذا الملف يطغى عليها فيختفي وسم «هيكل» من جدول التقارير. */
/** الوقت بلا ثوانٍ في الجدول — الثواني تُعرض كاملة في نافذة التعديل */
function hhmm(t) {
    return t ? String(t).slice(0, 5) : '';
}

function vehicleIdText(row) {
    const p = (row.plate_no || '').trim();
    return p !== '' ? p : ((row.chassis_no || '').trim() || '—');
}

async function loadIssued(filters) {
    const tb = document.getElementById('issuedTable');
    setTableLoading(tb, 7);

    let data;
    try {
        data = filters ? await Issued.search(filters) : await Issued.getAll();
    } catch (_) {
        tb.innerHTML = '<tr><td class="empty-row" colspan="7">حدث خطأ في الاتصال بالخادم</td></tr>';
        return;
    }
    if (data.status !== 'success') {
        tb.innerHTML = '<tr><td class="empty-row" colspan="7">حدث خطأ في تحميل البيانات</td></tr>';
        return;
    }

    const rows = data.data || [];
    document.getElementById('ivCount').textContent = rows.length;
    issuedMap = {};

    tb.innerHTML = rows.map(r => {
        issuedMap[r.issued_id] = r;
        const paid   = r.violation_status === 'paid';
        const active = r.is_active != 0;
        /* الجدول يحمل ما يُميّز المحضر في لمحة: متى وأين ومن حرّره.
           الباقي في لوحة التفاصيل بالنقر المزدوج.
           والمدفوعة لا تُلغى: أُخذ مالٌ مقابلها وصدر إيصال تحصيل،
           فالزرّ يُعطَّل بدل إخفائه ليبقى سبب المنع ظاهراً. */
        return `
        <tr class="tk-row${active ? '' : ' row-void'}" data-id="${r.issued_id}" title="انقر مرتين لعرض التفاصيل">
            <td data-label="#">${r.issued_id}</td>
            <td data-label="التاريخ">${escapeHtml(r.issued_date) || '—'}</td>
            <td data-label="الوقت">${escapeHtml(hhmm(r.issued_time)) || '—'}</td>
            <td data-label="اللوحة / الهيكل">${vehicleId(r)}</td>
            <td data-label="الضابط">${escapeHtml(r.officer_name) || '—'}</td>
            <td data-label="الحالة">
                ${active
                    ? `<span class="badge ${paid ? 'badge-paid' : 'badge-pending'}">
                           ${paid ? Icons.check + ' مدفوعة' : Icons.clock + ' معلّقة'}
                       </span>`
                    : `<span class="badge badge-void">${Icons.cross} ملغاة</span>`}
            </td>
            <td data-label="إجراءات" style="white-space:nowrap">
                <button class="btn btn-ghost" style="margin-left:4px"
                        onclick="openEditIssued(${r.issued_id})"
                        ${paid ? 'disabled title="مخالفة مدفوعة — لا تُعدَّل"' : ''}>تعديل</button>
                <button class="btn ${active ? 'btn-danger' : 'btn-success'}"
                        onclick="toggleIssued(${r.issued_id}, ${active ? 1 : 0})"
                        ${active && paid ? 'disabled title="مخالفة مدفوعة — لا تُلغى"' : ''}>
                    ${active ? 'إلغاء التفعيل' : 'تفعيل'}
                </button>
            </td>
        </tr>`;
    }).join('') || '<tr><td class="empty-row" colspan="7">لا توجد مخالفات مطابقة</td></tr>';

    bindIssuedRowOpen();
}

/* ── تعديل المخالفة الصادرة — FR-19 ──
   المودال يرسل الحقول المعروضة كلها لا المتغيّرة وحدها، لأن حساب
   «ما تغيّر» في الواجهة يفترض أن نسختها من السجل حديثة — وقد لا
   تكون. والخادم محصَّن أصلاً بـarray_key_exists فلا يكتب NULL في
   حقل لم يصله، فالحمايتان مستقلّتان لا تعتمد إحداهما على الأخرى. */
function openEditIssued(id) {
    const r = issuedMap[id];
    if (!r) return;

    document.getElementById('ei_id').value          = r.issued_id;
    document.getElementById('ei_title').textContent = '#' + r.issued_id;
    document.getElementById('ei_date').value        = r.issued_date || '';
    document.getElementById('ei_time').value        = r.issued_time || '';
    document.getElementById('ei_location').value    = r.location    || '';
    document.getElementById('ei_status').value      = r.violation_status || 'pending';

    document.getElementById('ei_context').textContent =
        `السائق: ${r.driver_name || '—'} · المركبة: ${vehicleIdText(r)} · `
      + `الضابط: ${r.officer_name || '—'} · الغرامة: ${r.total_fine || 0} د.ل`;

    document.getElementById('eiMsg').style.display = 'none';
    document.getElementById('editIssuedModal').classList.add('show');
}

async function saveIssued() {
    const btn = document.querySelector('#editIssuedModal .btn-primary');
    setLoading(btn, true);
    try {
        const res = await Issued.update({
            issued_id:        parseInt(document.getElementById('ei_id').value),
            issued_date:      document.getElementById('ei_date').value,
            issued_time:      document.getElementById('ei_time').value,
            location:         document.getElementById('ei_location').value.trim(),
            violation_status: document.getElementById('ei_status').value,
        });
        /* رسالة الخادم تُعرض كما هي — وهي التي تحمل سبب الرفض 409
           «لا يمكن تعديل مخالفة مدفوعة». تُعرض داخل المودال لا في
           الكونسول، ولا يُغلق المودال حتى يقرأها المستخدم. */
        if (res.status !== 'success') return showMsg('eiMsg', res.message || 'فشل التعديل', 'error');
        closeModal('editIssuedModal');
        showMsg('ivMsg', 'تم تعديل المخالفة بنجاح');
        searchIssued();
    } catch (_) {
        showMsg('eiMsg', 'حدث خطأ في الاتصال بالخادم', 'error');
    } finally {
        setLoading(btn, false);
    }
}

/* لوحة التفاصيل نفسها المستعملة في التقارير — openTicket وticketModal
   معرَّفان في reports.js وهو محمَّل في هذه الصفحة، فلا تُكرَّر الشيفرة.
   الربط على tbody لا على الصفوف: الجدول يُعاد بناؤه مع كل بحث،
   والحارس dataset يمنع تراكم المستمعين. */
function bindIssuedRowOpen() {
    const tb = document.getElementById('issuedTable');
    if (!tb || tb.dataset.bound) return;
    tb.dataset.bound = '1';
    tb.addEventListener('dblclick', e => {
        // النقر المزدوج على زرّ التعديل لا يفتح اللوحة
        if (e.target.closest('button')) return;
        const tr = e.target.closest('.tk-row');
        if (tr) openTicket(tr.dataset.id);
    });

    const modal = document.getElementById('ticketModal');
    if (modal && !modal.dataset.bound) {
        modal.dataset.bound = '1';
        modal.addEventListener('click', e => {
            if (e.target === modal) modal.classList.remove('show');
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') modal.classList.remove('show');
        });
    }
}

function showInactive() {
    const c = document.getElementById('iv_show_inactive');
    return !!(c && c.checked);
}

function searchIssued() {
    const f = {
        issued_id:  document.getElementById('iv_issued_id').value.trim(),
        plate_no:   document.getElementById('iv_plate_no').value.trim(),
        license_no: document.getElementById('iv_license_no').value.trim(),
    };
    const any = Object.values(f).some(v => v !== '');
    if (showInactive()) f.include_inactive = 1;
    loadIssued(any || showInactive() ? f : null);
}

function resetIssuedSearch() {
    ['iv_issued_id', 'iv_plate_no', 'iv_license_no']
        .forEach(id => { document.getElementById(id).value = ''; });
    searchIssued();
}

/* الإلغاء لا الحذف: الشرطي قد يُصدر مخالفات بغير قصد فيجمعها ويأتي
   بها إلى المركز، فتُلغى هنا. بياناتها تبقى في القاعدة كاملةً،
   وتختفي من النظام: لا تُحصَّل ولا تُستعلَم عنها ولا تدخل تقريراً. */
async function toggleIssued(id, currentlyActive) {
    const r = issuedMap[id];
    const label = r ? `#${id} — ${vehicleIdText(r)} · ${r.issued_date || ''}` : `#${id}`;
    const turningOff = currentlyActive == 1;

    const msg = turningOff
        ? `إلغاء تفعيل المخالفة ${label}؟\nستبقى بياناتها محفوظة في القاعدة، ولن تظهر في النظام ولا في التقارير ولا يمكن تحصيلها.\nيمكن إعادة تفعيلها لاحقاً.`
        : `إعادة تفعيل المخالفة ${label}؟\nستعود إلى النظام والتقارير ويمكن تحصيلها.`;
    if (!confirm(msg)) return;

    try {
        const res = await Issued.setActive(id, !turningOff);
        if (res.status !== 'success') return showMsg('ivMsg', res.message || 'فشل تغيير الحالة', 'error');
        showMsg('ivMsg', res.message);
        searchIssued();
    } catch (_) {
        showMsg('ivMsg', 'حدث خطأ في الاتصال بالخادم', 'error');
    }
}

// ============================================
// الحسابات
// ============================================

let userMap = {};

/* 'officer' غائب عن القائمتين عمداً: الخادم يرفضه بـ400، وإظهاره
   خياراً يوقع المستخدم في خطأ معروف مسبقاً. */
const ADMIN_ASSIGNABLE_ROLES = ['admin', 'department_admin', 'payment_center'];

/* مدير القسم ومركز الدفع لا معنى لهما خارج قسم: الأول يرى تقارير
   قسمه وضباطه، والثاني يُحصّل دفعات قسمه. لذلك يُحذف خيار «بلا قسم»
   لهذين الدورين، ولا تُعرض الأقسام غير المفعَّلة أصلاً. */
const DEPARTMENT_BOUND_ROLES = ['department_admin', 'payment_center'];

/* ── إنشاء حساب جديد ──
   القاعدة: لا يُنشأ حساب إلا ومعه كل ما يلزم دوره ليعمل. فالواجهة
   تُظهر لكل دور حقوله وحدها، والخادم يفرض الشرط نفسه مستقلاً — إذ
   إخفاء حقل ليس منعاً، وطلبٌ مباشر يتجاوز الواجهة كلها. */
const UI_CREATABLE_ROLES = ['department_admin', 'payment_center', 'admin'];

/** يُظهر حقول الدور المختار ويخفي ما لا يلزمه */
function syncCreateFields() {
    const role = document.getElementById('u_role').value;
    const dept = document.getElementById('u_deptField');
    const name = document.getElementById('u_nameField');
    if (!dept || !name) return;

    // مدير النظام فوق الأقسام — لا حقل قسم له
    dept.style.display = role === 'admin' ? 'none' : '';
    // موظف مركز الدفع يُنشأ بسجلّه، فاسمه الكامل إلزامي
    name.style.display = role === 'payment_center' ? '' : 'none';

    if (role !== 'admin') fillCreateDeptSelect(role);
}

/** قائمة الأقسام في بطاقة الإنشاء.
    لمدير القسم تُعرض الأقسام التي لا مدير لها فقط — فالقسم الذي له
    مدير مرفوض في الخادم أصلاً، وعرضه خياراً يوقع المستخدم في رفض
    كان يمكن تجنّبه. */
function fillCreateDeptSelect(role) {
    const sel = document.getElementById('u_department');
    if (!sel) return;

    const taken = role === 'department_admin';
    const list  = Object.values(deptMap)
        .filter(d => d.is_active == 1)
        .filter(d => !taken || !(d.admin_username && d.admin_is_active == 1));

    const opts = ['<option value="" disabled selected>— اختر القسم —</option>'];
    list.forEach(d => opts.push(
        `<option value="${d.department_id}">${escapeHtml(d.department_name)}</option>`));

    if (taken && list.length === 0) {
        opts.length = 0;
        opts.push('<option value="" disabled selected>كل الأقسام المفعَّلة لها مديرون</option>');
    }
    sel.innerHTML = opts.join('');
    sel.required  = true;
}

async function addUser() {
    const role     = document.getElementById('u_role').value;
    const dept     = document.getElementById('u_department').value;
    const username = document.getElementById('u_username').value.trim();
    const password = document.getElementById('u_password').value;
    const fullName = document.getElementById('u_officer_name').value.trim();

    if (!username || !password) {
        return showMsg('uMsg', 'اسم المستخدم وكلمة المرور مطلوبان', 'error');
    }
    if (password.length < 8) {
        document.getElementById('u_password').focus({ preventScroll: true });
        return showMsg('uMsg', 'كلمة المرور يجب ألا تقل عن ثمانية محارف', 'error');
    }
    if (role !== 'admin' && dept === '') {
        document.getElementById('u_department').focus({ preventScroll: true });
        return showMsg('uMsg', 'يجب اختيار القسم لحسابات مدير القسم وموظف مركز الدفع', 'error');
    }
    if (role === 'payment_center' && !fullName) {
        document.getElementById('u_officer_name').focus({ preventScroll: true });
        return showMsg('uMsg', 'الاسم الكامل مطلوب لحساب موظف مركز الدفع', 'error');
    }
    /* مدير النظام أعلى صلاحية في النظام: يرى كل الأقسام ويُدير دليل
       المخالفات والحسابات. فالتأكيد هنا ليس تزيّداً. */
    if (role === 'admin' &&
        !confirm(`إنشاء حساب «${username}» بدور مدير النظام؟\n\n`
               + 'مدير النظام يرى بيانات الأقسام كلها، ويدير الحسابات ودليل المخالفات، '
               + 'ويطّلع على التقارير الشاملة.\n\nتأكيد؟')) return;

    const btn = document.querySelector('#tab-users .btn-primary');
    setLoading(btn, true);
    try {
        const res = await Users.create({
            username, password, role,
            department_id: role === 'admin' ? null : parseInt(dept),
            officer_name:  role === 'payment_center' ? fullName : undefined,
        });
        // رسالة الخادم تُعرض كما هي — فهي التي تذكر اسم المدير الحالي عند التعارض
        if (res.status !== 'success') return showMsg('uMsg', res.message || 'فشل إنشاء الحساب', 'error');
        ['u_username', 'u_password', 'u_officer_name'].forEach(id =>
            document.getElementById(id).value = '');
        showMsg('uMsg', 'تم إنشاء الحساب بنجاح');
        await loadDepartments();   // قسمٌ صار له مدير يخرج من القائمة
        syncCreateFields();
        await loadUsers();
    } catch (_) {
        showMsg('uMsg', 'حدث خطأ في الاتصال بالخادم', 'error');
    } finally {
        setLoading(btn, false);
    }
}

function fillDeptSelect(selectId, selected, role) {
    const sel = document.getElementById(selectId);
    if (!sel) return;

    const bound = DEPARTMENT_BOUND_ROLES.includes(role);
    const opts  = [bound
        ? '<option value="" disabled>— اختر القسم —</option>'
        : '<option value="">— بلا قسم —</option>'];

    Object.values(deptMap)
        .filter(d => d.is_active == 1)
        .forEach(d => {
            opts.push(`<option value="${d.department_id}">${escapeHtml(d.department_name)}</option>`);
        });

    sel.innerHTML = opts.join('');
    sel.value = selected == null ? '' : String(selected);
    sel.required = bound;
}

/** يُعيد بناء قائمة الأقسام كلما تغيّر الدور، حافظاً الاختيار إن بقي صالحاً */
function syncDeptForRole(roleSelectId, deptSelectId) {
    const roleSel = document.getElementById(roleSelectId);
    const deptSel = document.getElementById(deptSelectId);
    if (!roleSel || !deptSel) return;
    fillDeptSelect(deptSelectId, deptSel.value || null, roleSel.value);
}

async function loadUsers() {
    const tb = document.getElementById('usersTable');
    setTableLoading(tb, 7);

    // قائمة الأقسام لازمة لعرض اسم قسم كل حساب ولقائمتَي الإنشاء والتعديل
    if (!Object.keys(deptMap).length) await loadDepartments();
    syncCreateFields();

    let data;
    try {
        data = await Users.getAll();
    } catch (_) {
        tb.innerHTML = '<tr><td class="empty-row" colspan="7">حدث خطأ في الاتصال بالخادم</td></tr>';
        return;
    }
    if (data.status !== 'success') {
        tb.innerHTML = '<tr><td class="empty-row" colspan="7">حدث خطأ في تحميل البيانات</td></tr>';
        return;
    }

    const rows = data.data || [];
    document.getElementById('uCount').textContent = rows.length;
    userMap = {};

    tb.innerHTML = rows.map(u => {
        userMap[u.user_id] = u;
        const active  = u.is_active == 1;
        const isSelf  = currentUserId != null && Number(u.user_id) === Number(currentUserId);
        const officer = u.role === 'officer';
        return `
        <tr>
            <td data-label="#">${u.user_id}</td>
            <td data-label="اسم المستخدم">${escapeHtml(u.username)}${isSelf ? ' <span class="badge">أنت</span>' : ''}</td>
            <td data-label="الدور"><span class="badge ${roleBadges[u.role] || ''}">${roleNames[u.role] || escapeHtml(u.role)}</span></td>
            <td data-label="القسم">${escapeHtml(u.department_name) || '—'}</td>
            <td data-label="سجل الضابط">${u.officer_id ? escapeHtml(u.officer_name) + ' (' + escapeHtml(u.employee_no || '—') + ')' : '—'}</td>
            <td data-label="الحالة">
                <span class="badge ${active ? 'badge-paid' : 'badge-pending'}">
                    ${active ? Icons.check + ' نشط' : Icons.cross + ' معطَّل'}
                </span>
            </td>
            <td data-label="إجراءات" style="white-space:nowrap">
                <button class="btn btn-ghost" onclick="openEditUser(${u.user_id})" style="margin-left:4px"${officer ? ' disabled title="حساب رجل مرور — يُدار من لوحة مدير القسم"' : ''}>تعديل</button>
                <button class="btn ${active ? 'btn-danger' : 'btn-success'}"
                        onclick="toggleUser(${u.user_id}, ${active ? 1 : 0})"${isSelf ? ' disabled title="لا يمكنك تعطيل حسابك"' : ''}>
                    ${active ? 'تعطيل' : 'تفعيل'}
                </button>
            </td>
        </tr>`;
    }).join('') || '<tr><td class="empty-row" colspan="7">لا توجد حسابات</td></tr>';
}

function openEditUser(id) {
    const u = userMap[id];
    if (!u) return;

    document.getElementById('eu_id').value       = u.user_id;
    document.getElementById('eu_username').value = u.username || '';
    document.getElementById('eu_password').value = '';

    const sel = document.getElementById('eu_role');
    sel.innerHTML = ADMIN_ASSIGNABLE_ROLES
        .map(r => `<option value="${r}">${roleNames[r]}</option>`).join('');
    sel.value = ADMIN_ASSIGNABLE_ROLES.includes(u.role) ? u.role : 'payment_center';

    fillDeptSelect('eu_department', u.department_id, sel.value);

    document.getElementById('euMsg').style.display = 'none';
    document.getElementById('editUserModal').classList.add('show');
}

/* الاسم مميَّز عمداً: auth.js فيه saveUser(user) يحفظ المستخدم في
   localStorage، ويُناديها requireRole() عند كل تحميل صفحة. تسمية هذه
   الدالة saveUser كانت تطغى عليها — فيُرسَل عند كل دخول طلبُ تعديل
   حساب بحمولة فارغة يردّ 400، ولا تُحفظ لقطة المستخدم أصلاً. */
async function saveUserAccount() {
    const btn  = document.querySelector('#editUserModal .btn-primary');
    const dept = document.getElementById('eu_department').value;
    const pw   = document.getElementById('eu_password').value;

    const role = document.getElementById('eu_role').value;
    if (DEPARTMENT_BOUND_ROLES.includes(role) && dept === '') {
        document.getElementById('eu_department').focus({ preventScroll: true });
        return showMsg('euMsg', 'يجب اختيار القسم لحسابات مدير القسم ومركز الدفع', 'error');
    }

    const payload = {
        user_id:       parseInt(document.getElementById('eu_id').value),
        username:      document.getElementById('eu_username').value.trim(),
        role,
        department_id: dept === '' ? null : parseInt(dept),
    };
    if (pw) payload.password = pw;

    setLoading(btn, true);
    try {
        const res = await Users.update(payload);
        if (res.status !== 'success') return showMsg('euMsg', res.message || 'فشل التعديل', 'error');
        closeModal('editUserModal');
        showMsg('uMsg', 'تم تعديل الحساب بنجاح');
        await loadUsers();
    } catch (_) {
        showMsg('euMsg', 'حدث خطأ في الاتصال بالخادم', 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function toggleUser(id, currentlyActive) {
    const u = userMap[id];
    const turningOff = currentlyActive == 1;
    const label = u ? u.username : 'الحساب';
    const msg = turningOff
        ? `تعطيل «${label}»؟\nسينتهي أثره فوراً حتى على جلسة مفتوحة.\nلن تُحذف أي بيانات.`
        : `تفعيل «${label}»؟`;
    if (!confirm(msg)) return;
    try {
        const res = await Users.update({ user_id: id, is_active: turningOff ? 0 : 1 });
        if (res.status !== 'success') return showMsg('uMsg', res.message || 'فشل تغيير الحالة', 'error');
        showMsg('uMsg', turningOff ? 'تم تعطيل الحساب' : 'تم تفعيل الحساب');
        await loadUsers();
    } catch (_) {
        showMsg('uMsg', 'حدث خطأ في الاتصال بالخادم', 'error');
    }
}


// ============================================
// سجل الإيصالات — قراءة فقط
// ============================================
/* الإيصال سجلّ أرشيفي يُكتب مع إصدار كل مخالفة ولا يُعدَّل بعدها،
   فلا زرّ تعديل هنا ولا حذف. والتصفية تجري محلياً على الصفوف
   المحمَّلة: السجل صغير، وطلبُ الخادم مع كل حرف إسرافٌ بلا فائدة. */
let receiptRows = [];

async function loadReceipts() {
    const tb = document.getElementById('receiptsTable');
    setTableLoading(tb, 10);

    let data;
    try {
        data = await Receipts.getAll();
    } catch (_) {
        tb.innerHTML = '<tr><td class="empty-row" colspan="10">حدث خطأ في الاتصال بالخادم</td></tr>';
        return;
    }
    if (data.status !== 'success') {
        tb.innerHTML = '<tr><td class="empty-row" colspan="10">حدث خطأ في تحميل البيانات</td></tr>';
        return;
    }
    receiptRows = data.data || [];
    renderReceipts();
}

function renderReceipts() {
    const tb = document.getElementById('receiptsTable');
    if (!tb) return;
    const q = (document.getElementById('rc_q').value || '').trim().toLowerCase();

    const rows = q === '' ? receiptRows : receiptRows.filter(r =>
        [r.receipt_id, r.issued_id, r.driver_name, r.plate_no, r.chassis_no, r.officer_name]
            .some(f => String(f == null ? '' : f).toLowerCase().includes(q)));

    document.getElementById('rcCount').textContent = rows.length;

    tb.innerHTML = rows.map(r => {
        const paid = r.violation_status === 'paid';
        return `
        <tr>
            <td data-label="رقم الإيصال">${r.receipt_id}</td>
            <td data-label="رقم المخالفة">${r.issued_id == null ? '—' : r.issued_id}</td>
            <td data-label="التاريخ">${escapeHtml(r.issued_date) || '—'}</td>
            <td data-label="السائق">${escapeHtml(r.driver_name) || '—'}</td>
            <td data-label="اللوحة / الهيكل">${vehicleId(r)}</td>
            <td data-label="الضابط">${escapeHtml(r.officer_name) || '—'}</td>
            <td data-label="القسم">${escapeHtml(r.department_name) || '—'}</td>
            <td data-label="البنود">${r.violation_count || 0}</td>
            <td data-label="الإجمالي">${r.total_fine || 0} د.ل</td>
            <td data-label="الحالة">
                <span class="badge ${paid ? 'badge-paid' : 'badge-pending'}">
                    ${paid ? Icons.check + ' مدفوعة' : Icons.clock + ' معلّقة'}
                </span>
            </td>
        </tr>`;
    }).join('') || '<tr><td class="empty-row" colspan="10">لا توجد إيصالات مطابقة</td></tr>';
}

// ============================================
// تهيئة الصفحة
// ============================================

let currentUserId = null;

const tabsMap = {
    departments: loadDepartments,
    violations:  loadViolations,
    issued:      () => loadIssued(null),
    users:       loadUsers,
    receipts:    loadReceipts,
    reports:     loadReportsTab,   // معرّفة في reports.js
};

document.addEventListener('DOMContentLoaded', async () => {
    const user = await requireRole('admin');
    if (!user) return;
    currentUserId = user.user_id;
    renderNavbarInfo(user);
    // حقول بطاقة الإنشاء تتبع الدور المختار
    const ur = document.getElementById('u_role');
    if (ur) ur.addEventListener('change', syncCreateFields);

    // تصفية سجل الإيصالات محلياً — لا طلب جديد لكل حرف
    const rcq = document.getElementById('rc_q');
    if (rcq) rcq.addEventListener('input', renderReceipts);

    // قائمة الأقسام تتبع الدور: «بلا قسم» يظهر لمدير النظام وحده
    const eur = document.getElementById('eu_role');
    if (eur) eur.addEventListener('change', () => syncDeptForRole('eu_role', 'eu_department'));
    loadDepartments();
});
