// ============================================
// AUTH.JS — تسجيل الدخول والخروج والتحقق
// ============================================

// ============================================
// جلب بيانات المستخدم (للعرض فقط، وليست مصدر الصلاحية)
// ============================================

function saveUser(user) {
    localStorage.setItem('user', JSON.stringify(user));
}

function logout() {
    localStorage.removeItem('user');
    fetch(`${API}/logout.php`, { method: 'POST', credentials: 'include' })
        .finally(() => window.location.href = 'index.html');
}

// ============================================
// التحقق من الجلسة عبر السيرفر (الصلاحية الحقيقية)
// ============================================

async function requireRole(...roles) {
    try {
        const res  = await fetch(`${API}/me.php`, { credentials: 'include' });
        const data = await res.json();

        if (data.status !== 'success' || !roles.includes(data.user.role)) {
            window.location.href = 'index.html';
            return null;
        }

        saveUser(data.user);
        return data.user;
    } catch (err) {
        window.location.href = 'index.html';
        return null;
    }
}

// ============================================
// تسجيل الدخول
// ============================================

async function login(username, password) {
    try {
        const res  = await fetch(`${API}/login.php`, {
            method:      'POST',
            credentials: 'include',
            headers:     { 'Content-Type': 'application/json' },
            body:        JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (data.status === 'success') {
            saveUser(data.user);
            switch (data.user.role) {
                case 'admin':            window.location.href = 'admin.html';      break;
                case 'department_admin': window.location.href = 'department.html'; break;
                case 'officer':          window.location.href = 'officer.html';    break;
                case 'payment_center':   window.location.href = 'payment.html';    break;
            }
        }

        return data;
    } catch (err) {
        return { status: 'error', message: 'تعذّر الاتصال بالخادم' };
    }
}

// ============================================
// عرض معلومات المستخدم في الـ navbar
// ============================================

function renderNavbarInfo(user) {
    const el = document.getElementById('navbarInfo');
    if (!el || !user) return;
    el.textContent = `${user.officer_name || user.username} — ${roleNames[user.role] || ''}`;
}
