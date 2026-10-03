let user = null;

// ============================================
// الضباط والموظفون
// ============================================

let officerMap = {};

async function loadOfficers() {
    const tb = document.getElementById('officersTable');
    if (!tb) return;
    try {
        const data = await Officers.getAll();
        if (data.status !== 'success') {
            tb.innerHTML = '<tr><td class="empty-row" colspan="8">حدث خطأ في تحميل البيانات</td></tr>';
            return;
        }
        officerMap = {};
        tb.innerHTML = (data.data || []).map(o => {
            officerMap[o.officer_id] = o;
            const active = o.is_active == 1;
            return `
            <tr>
                <td data-label="رقم الموظف">${escapeHtml(o.employee_no) || '—'}</td>
                <td data-label="الاسم">${escapeHtml(o.officer_name) || '—'}</td>
                <td data-label="الرتبة">${escapeHtml(o.officer_rank) || '—'}</td>
                <td data-label="التابع">${escapeHtml(o.officer_unit) || '—'}</td>
                <td data-label="الدور"><span class="badge ${roleBadges[o.role] || ''}">${roleNames[o.role] || ''}</span></td>
                <td data-label="اسم المستخدم">${escapeHtml(o.username) || '—'}</td>
                <td data-label="الحالة">
                    <span class="badge ${active ? 'badge-paid' : 'badge-pending'}">
                        ${active ? Icons.check + ' نشط' : Icons.cross + ' غير نشط'}
                    </span>
                </td>
                <td data-label="إجراءات" style="white-space:nowrap">
                    <button class="btn btn-ghost" onclick="openEditOfficer(${o.officer_id})" style="margin-left:4px">تعديل</button>
                    <button class="btn ${active ? 'btn-danger' : 'btn-success'}"
                        onclick="toggleOfficer(${o.user_id}, ${o.is_active})">
                        ${active ? 'إلغاء التنشيط' : 'تنشيط'}
                    </button>
                </td>
            </tr>`;
        }).join('') || '<tr><td class="empty-row" colspan="8">لا يوجد ضباط أو موظفون</td></tr>';
    } catch (err) {
        tb.innerHTML = '<tr><td class="empty-row" colspan="8">حدث خطأ في الاتصال بالخادم</td></tr>';
    }
}

// ============================================
// تعديل الضابط — كل الحقول
// ============================================

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

function openEditOfficer(id) {
    const o = officerMap[id];
    if (!o) return;
    document.getElementById('eo_id').value          = o.officer_id;
    document.getElementById('eo_employee_no').value = o.employee_no  || '';
    document.getElementById('eo_name').value        = o.officer_name || '';
    document.getElementById('eo_rank').value        = o.officer_rank || '';
    document.getElementById('eo_unit').value        = o.officer_unit || '';
    document.getElementById('eo_role').value        = o.role         || 'officer';
    document.getElementById('eo_username').value    = o.username     || '';
    document.getElementById('eo_password').value    = '';
    document.getElementById('eoMsg').style.display  = 'none';
    document.getElementById('editOfficerModal').classList.add('show');
}

async function saveOfficer() {
    const btn  = document.querySelector('#editOfficerModal .btn-primary');
    const name = document.getElementById('eo_name').value.trim();

    if (!name) return showMsg('eoMsg', 'اسم الضابط مطلوب', 'error');

    setLoading(btn, true);
    try {
        const res = await Officers.update({
            officer_id:   parseInt(document.getElementById('eo_id').value),
            employee_no:  document.getElementById('eo_employee_no').value.trim(),
            officer_name: name,
            officer_rank: document.getElementById('eo_rank').value.trim(),
            officer_unit: document.getElementById('eo_unit').value.trim(),
            role:         document.getElementById('eo_role').value,
            username:     document.getElementById('eo_username').value.trim(),
            password:     document.getElementById('eo_password').value,
        });
        if (res.status !== 'success') return showMsg('eoMsg', res.message || 'فشل التعديل', 'error');
        closeModal('editOfficerModal');
        showMsg('oMsg', 'تم تعديل بيانات الضابط بنجاح');
        await loadOfficers();
    } catch (_) {
        showMsg('eoMsg', 'حدث خطأ في الاتصال بالخادم', 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function addOfficer() {
    const btn = document.getElementById('addOfficerBtn');
    if (btn && btn.disabled) return;

    const employee_no = document.getElementById('o_employee_no').value.trim();
    const name        = document.getElementById('o_name').value.trim();
    const rank        = document.getElementById('o_rank').value.trim();
    const unit        = document.getElementById('o_unit').value.trim();
    const role        = document.getElementById('o_role').value;
    const username    = document.getElementById('o_username').value.trim();
    const password    = document.getElementById('o_password').value.trim();

    if (!name || !username || !password) {
        return showMsg('oMsg', 'يرجى تعبئة الاسم واسم المستخدم وكلمة المرور', 'error');
    }

    setLoading(btn, true);
    try {
        const res = await Officers.create({
            employee_no,
            officer_name:  name,
            officer_rank:  rank,
            officer_unit:  unit,
            username,
            password,
            role,
        });

        if (res.status === 'success') {
            showMsg('oMsg', 'تمت الإضافة بنجاح');
            document.getElementById('o_employee_no').value = '';
            document.getElementById('o_name').value        = '';
            document.getElementById('o_rank').value        = '';
            document.getElementById('o_unit').value        = '';
            document.getElementById('o_username').value    = '';
            document.getElementById('o_password').value    = '';
            loadOfficers();
        } else {
            showMsg('oMsg', res.message || 'حدث خطأ', 'error');
        }
    } catch (err) {
        showMsg('oMsg', 'حدث خطأ في الاتصال بالخادم', 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function toggleOfficer(user_id, current) {
    try {
        const res = await Users.update({ user_id, is_active: current == 1 ? 0 : 1 });
        if (res.status !== 'success') return showMsg('oMsg', res.message || 'حدث خطأ', 'error');
        loadOfficers();
    } catch (err) {
        showMsg('oMsg', 'حدث خطأ في الاتصال بالخادم', 'error');
    }
}

const tabsMap = {
    officers: loadOfficers,
    reports:  loadReportsTab,   // معرّفة في reports.js — محصورة على القسم في الخادم
};

// ============================================
// تهيئة الصفحة
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    user = await requireRole('department_admin');
    if (!user) return;
    renderNavbarInfo(user);
    loadOfficers();
});
