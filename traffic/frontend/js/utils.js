// ============================================
// UTILS.JS — دوال مساعدة مشتركة
// ============================================

const API = window.location.origin + '/traffic/backend/api';

// ============================================
// المظهر — الوضع الفاتح والداكن
// ============================================

// يُنفَّذ فوراً لتجنب وميض التصميم الخاطئ
(function initTheme() {
    try {
        const saved = localStorage.getItem('theme');
        if (saved) document.documentElement.dataset.theme = saved;
    } catch (e) { /* التخزين قد يكون معطّلاً — يُتبع تفضيل النظام */ }
})();

function getIsDark() {
    const t = document.documentElement.dataset.theme;
    if (t) return t === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const _SVG_SUN  = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
const _SVG_MOON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

function toggleTheme() {
    const next = getIsDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) { /* لا يضر */ }
    const btn = document.getElementById('themeToggle');
    if (btn) btn.innerHTML = next === 'dark' ? _SVG_SUN : _SVG_MOON;
}

function injectThemeToggle() {
    // إذا كان الزر موجوداً مسبقاً (صفحة الدخول)، نكتفي بتعيين الأيقونة
    const existing = document.getElementById('themeToggle');
    if (existing) {
        existing.innerHTML = getIsDark() ? _SVG_SUN : _SVG_MOON;
        existing.onclick = toggleTheme;
        return;
    }
    const controls = document.querySelector('.navbar-controls');
    if (!controls) return;
    const btn = document.createElement('button');
    btn.id        = 'themeToggle';
    btn.className = 'btn-theme-toggle';
    btn.setAttribute('title', 'تبديل المظهر');
    btn.innerHTML = getIsDark() ? _SVG_SUN : _SVG_MOON;
    btn.onclick   = toggleTheme;
    controls.insertBefore(btn, controls.firstChild);
}

document.addEventListener('DOMContentLoaded', injectThemeToggle);

// ============================================
// تذييل الصفحة وتاريخ اليوم
// ============================================
/* كانت الصفحات تنتهي بلا شيء: آخر بطاقة ثم فراغ إلى أسفل
   النافذة. التذييل يُركَّب من هنا لا في كل ملف HTML على
   حدة، فيبقى نصّه واحداً ولا يتفرّق. */
const _MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                    'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function formatDateAr(d) {
    return `${d.getDate()} ${_MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}

function mountPageChrome() {
    const now = new Date();
    if (document.querySelector('.page-foot')) return;

    const foot = document.createElement('footer');
    foot.className = 'page-foot';
    foot.innerHTML =
        '<div class="page-foot-inner">' +
          '<span>' +
            '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/></svg>' +
            '<strong>نظام إدارة المخالفات المرورية</strong>' +
          '</span>' +
          '<span>' + formatDateAr(now) + '</span>' +
        '</div>';
    document.body.appendChild(foot);
}

document.addEventListener('DOMContentLoaded', mountPageChrome);

// ============================================
// Enter ينتقل إلى الحقل التالي
// ============================================
/* في إدخال بيانات المخالفة ميدانياً، Enter لا يفعل شيئاً افتراضياً
   فيضطر الضابط لرفع يده إلى Tab أو للنقر. صار ينقل إلى الحقل التالي،
   وعند آخر حقل يُركّز زر التنفيذ فيكفي Enter آخر.

   يُفعَّل بوضع data-enter-nav على الحاوية، ويُستثنى ما له معالج Enter
   خاص (البحث، الموقع، قوائم الاختيار) بوضع data-enter-skip عليه. */
function enableEnterNavigation(scope) {
    if (!scope || scope.dataset.enterNavBound) return;
    scope.dataset.enterNavBound = '1';

    const usable = () => Array.from(scope.querySelectorAll('input, select'))
        .filter(f => !f.disabled
                  && f.type !== 'hidden'
                  && f.offsetParent !== null
                  && !f.closest('[data-enter-skip]'));

    scope.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;

        const el = e.target;
        if (!el || el.tagName === 'TEXTAREA') return;          // Enter = سطر جديد
        if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT') return;
        if (el.closest('[data-enter-skip]')) return;

        const fields = usable();
        const i = fields.indexOf(el);
        if (i === -1) return;

        e.preventDefault();

        const next = fields[i + 1];
        if (next) {
            next.focus();
            if (typeof next.select === 'function') next.select();
            return;
        }
        // آخر حقل: ركّز زر التنفيذ بدل ترك المؤشّر معلّقاً
        const btn = scope.querySelector('.btn-primary, .btn-issue, .btn-success, .btn');
        if (btn) btn.focus(); else el.blur();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-enter-nav]').forEach(enableEnterNavigation);
});

// ============================================
// الوقت والتاريخ
// ============================================



function getNow() {
    const now  = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0];
    return { date, time };
}

// "22:41:41" -> "10:41 م"  ·  "07:20:00" -> "7:20 ص"
function formatTime12(t) {
    if (!t) return '—';
    const p = String(t).split(':');
    let h = parseInt(p[0], 10);
    const m = (p[1] || '00').padStart(2, '0');
    if (isNaN(h)) return t;
    const suffix = h < 12 ? 'ص' : 'م';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${m} ${suffix}`;
}



// ============================================
// الأرقام بالحروف العربية
// ============================================

function numberToArabic(n) {
    const ones = [
        '','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة','عشرة',
        'أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر',
        'ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'
    ];
    const tens     = ['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
    const hundreds = ['','مئة','مئتان','ثلاثمئة','أربعمئة','خمسمئة','ستمئة','سبعمئة','ثمانمئة','تسعمئة'];
    n = Math.floor(n);
    if (n === 0)    return 'صفر';
    if (n < 20)     return ones[n];
    if (n < 100)    return tens[Math.floor(n/10)] + (n%10 ? ' و' + ones[n%10] : '');
    if (n < 1000)   return hundreds[Math.floor(n/100)] + (n%100 ? ' و' + numberToArabic(n%100) : '');
    if (n < 1000000) return numberToArabic(Math.floor(n/1000)) + ' ألف' + (n%1000 ? ' و' + numberToArabic(n%1000) : '');
    return n;
}

// ============================================
// عرض الرسائل
// ============================================

/* الرسائل العابرة كلها تُعرض عائمةً أسفل الشاشة.
   كانت تُعرض مضمَّنةً أعلى بطاقتها، فمن يعمل في آخر جدول طويل لا
   يراها إلا إن صعد يبحث عنها — وهذا غير عملي في الاستعمال الدائم.
   العنصر المضمَّن يبقى في الصفحة ويُكتب فيه النصّ (تعتمد عليه
   الاختبارات وقارئات الشاشة عبر aria-live)، لكنه لا يُعرض فلا
   تتكرّر الرسالة نفسها في موضعين. */
function showMsg(id, text, type = 'success') {
    const el = document.getElementById(id);
    if (el) {
        if (el._msgTimer) { clearTimeout(el._msgTimer); el._msgTimer = null; }
        el.className     = `msg msg-${type}`;
        el.textContent   = text;
        el.style.display = 'none';
    }
    showToast(text, type);
}

/* ============================================
   الرسائل الطائرة — قناة الإشعار الوحيدة
   ============================================
   تظهر أسفل الشاشة فوق كل شيء، فتُرى أينما كان المستخدم في
   الصفحة بلا أن يصعد يبحث عنها. */

function showToast(text, type = 'success') {
    let host = document.getElementById('toastHost');
    if (!host) {
        host = document.createElement('div');
        host.id        = 'toastHost';
        host.className = 'toast-host';
        // يُعلَن للقارئ الآلي بلا خطف التركيز من الحقل الذي يكتب فيه
        host.setAttribute('role', 'status');
        host.setAttribute('aria-live', 'polite');
        document.body.appendChild(host);
    }

    // النصّ نفسه معروض بالفعل — لا يُكرَّر
    if (Array.from(host.children).some(c => c.dataset.text === text)) return;

    const t = document.createElement('div');
    // ألوان .msg نفسها: لا لوحة ألوان ثانية للشيء نفسه
    t.className     = `msg msg-${type} toast`;
    t.dataset.text  = text;
    t.textContent   = text;
    host.appendChild(t);

    requestAnimationFrame(() => t.classList.add('toast-in'));
    setTimeout(() => {
        t.classList.remove('toast-in');
        setTimeout(() => t.remove(), 300);
    }, 4600);
}

/* ============================================
   حالة التحميل في الجداول
   ============================================
   استبدال جدول كامل بصفّ «جارٍ التحميل» يُقلّص ارتفاع الصفحة —
   وقد قِسناه: 1813px تصير 900px — فيقصّ المتصفح موضع التمرير إلى
   أقصى ما تسمح به الصفحة القصيرة، أي إلى الأعلى. ثم تعود الصفوف
   ويعود الارتفاع، لكن موضع التمرير لا يعود.
   فهذه هي قفزة الشريط إلى أعلى عند كل إجراء يُعيد تحميل جدول.

   العلاج: لا تُفرَّغ الصفوف القائمة. تبقى معروضة حتى تحلّ محلها
   الصفوف الجديدة، فلا يتغيّر الارتفاع ولا يُقصّ التمرير. وإشارة
   التحميل تُعرض فقط حين لا يوجد ما يُفرَّغ أصلاً. */
function setTableLoading(tbody, colspan) {
    if (!tbody) return;
    const hasRealRows = tbody.children.length > 0 && !tbody.querySelector('.empty-row');
    if (hasRealRows) return;
    tbody.innerHTML = `<tr><td class="empty-row" colspan="${colspan}">جارٍ التحميل…</td></tr>`;
}

/* طباعة منطقة الإيصال وحدها.
   الصنف يُفعّل قاعدة الطباعة في components.css ثم يُزال،
   حتى لا تتأثر طباعة بقية الصفحات (كالتقارير). */
function printReceiptArea(delay = 300) {
    setTimeout(() => {
        document.body.classList.add('printing-receipt');
        const cleanup = () => document.body.classList.remove('printing-receipt');
        window.addEventListener('afterprint', cleanup, { once: true });
        window.print();
        // احتياط لمتصفحات لا تُطلق afterprint
        setTimeout(cleanup, 1500);
    }, delay);
}

function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function setLoading(btn, isLoading) {
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn._origHTML = btn.innerHTML;
        btn.innerHTML = '<span style="opacity:.7">جاري...</span>';
    } else {
        btn.disabled = false;
        if (btn._origHTML !== undefined) {
            btn.innerHTML = btn._origHTML;
            delete btn._origHTML;
        }
    }
}

// ============================================
// التبويبات
// ============================================

function showTab(name, tabsMap) {
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === name);
    });
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const section = document.getElementById('tab-' + name);
    if (section) section.classList.add('active');
    if (tabsMap && tabsMap[name]) tabsMap[name]();
}

// ============================================
// الأدوار بالعربية
// ============================================

const roleNames = {
    admin:            'مدير النظام',
    department_admin: 'مدير قسم',
    officer:          'شرطي',
    payment_center:   'مركز دفع'
};

const roleBadges = {
    admin:            'badge-admin',
    department_admin: 'badge-dept-admin',
    officer:          'badge-officer',
    payment_center:   'badge-payment'
};

const methodNames = {
    cash:    'نقداً',
    card:    'بطاقة مصرفية',
    libyana: 'كروت ليبيانا',
    sadad:   'سداد'
};

// ============================================
// الأيقونات (بدائل الإيموجي)
// ============================================

const Icons = {
    check: '<svg class="icon icon-sm" viewBox="0 0 24 24"><polyline points="4 12 9 17 20 6"/></svg>',
    cross: '<svg class="icon icon-sm" viewBox="0 0 24 24"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>',
    clock: '<svg class="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/></svg>',
};

// ============================================
// تنسيق حالة المخالفة
// ============================================

function statusBadge(status) {
    return status === 'paid'
        ? `<span class="badge badge-paid">${Icons.check} مدفوعة</span>`
        : `<span class="badge badge-pending">${Icons.clock} معلقة</span>`;
}

// ============================================
// أدوات التقارير
// ============================================

function emptyRow(colspan, text = 'لا توجد نتائج مطابقة') {
    return `<tr><td class="empty-row" colspan="${colspan}">${text}</td></tr>`;
}

