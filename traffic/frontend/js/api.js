// ============================================
// API.JS — كل طلبات الـ API
// ============================================

// ============================================
// دالة مساعدة للطلبات
// ============================================

async function request(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);
    const res  = await fetch(`${API}/${endpoint}`, options);
    const data = await res.json();
    if (res.status === 401) {
        if (typeof logout === 'function') logout();
        return data;
    }
    return data;
}

// ============================================
// الأقسام
// ============================================

const Departments = {
    getAll:  ()     => request('departments/index.php'),
    create:  (data) => request('departments/index.php', 'POST', data),
    update:  (data) => request('departments/index.php', 'PUT',  data),
    // تنشيط / إلغاء تنشيط — بديل الحذف، يحفظ السجلات وعلاقاتها
    setActive: (id, isActive) =>
        request('departments/index.php', 'PATCH', { department_id: id, is_active: isActive ? 1 : 0 }),
};

// ============================================
// الضباط
// ============================================

const Officers = {
    getAll:  ()     => request('officers/index.php'),
    create:  (data) => request('officers/index.php', 'POST', data),
    update:  (data) => request('officers/index.php', 'PUT',  data),
};

// ============================================
// المستخدمون
// ============================================

const Users = {
    getAll:  ()     => request('users/index.php'),
    create:  (data) => request('users/index.php', 'POST', data),
    update:  (data) => request('users/index.php', 'PUT',  data),
};

// ============================================
// المخالفات القانونية
// ============================================

const Violations = {
    getAll:  ()     => request('violations/index.php'),
    create:  (data) => request('violations/index.php', 'POST',   data),
    update:  (data) => request('violations/index.php', 'PUT',    data),
    delete:  (id)   => request('violations/index.php', 'DELETE', { violation_id: id }),
};

// ============================================
// المخالفات المُصدَرة
// ============================================

const Issued = {
    /* includeInactive: مدير النظام وحده — يستدعي الملغاة معها ليراجعها */
    getAll:  (includeInactive) =>
        request('issued/index.php' + (includeInactive ? '?include_inactive=1' : '')),
    search:  (filters = {}) => {
        const query = Object.entries(filters)
            .filter(([, v]) => v !== '' && v != null)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        return request(`issued/index.php${query ? '?' + query : ''}`);
    },
    create:  (data) => request('issued/index.php', 'POST',   data),
    update:  (data) => request('issued/index.php', 'PUT',    data),
    delete:  (id)   => request('issued/index.php', 'DELETE', { issued_id: id }),
    setActive: (id, active) =>
        request('issued/index.php', 'PATCH', { issued_id: id, is_active: active ? 1 : 0 }),
};

// ============================================
// الإيصالات — سجل أرشيفي للقراءة فقط (مدير النظام)
// ============================================

const Receipts = {
    getAll:  ()     => request('receipts/index.php'),
};

// ============================================
// المدفوعات
// ============================================

const Payments = {
    getAll:  ()     => request('payments/index.php'),
    create:  (data) => request('payments/index.php', 'POST', data),
};

// ============================================
// التقارير — نقطة نهاية موحّدة، كل التجميع في SQL
// ============================================

const Reports = {
    meta:   ()   => request('reports/index.php?meta=1'),
    run:    (f)  => request('reports/index.php' + Reports.qs(f)),
    detail: (id) => request('reports/index.php?detail=' + encodeURIComponent(id)),
    qs:    (f = {}) => {
        const s = Object.entries(f)
            .filter(([, v]) => v !== '' && v != null)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        return s ? '?' + s : '?';
    },
};

// ============================================
// نقاط الاستعلام والدفع العامة (بدون تسجيل دخول)
// ============================================

const Public = {
    lookup: (issued_id) => request(`public/lookup.php?issued_id=${encodeURIComponent(issued_id)}`),
    pay:    (data)       => request('public/pay.php', 'POST', data),
};
