// ============================================
// REPORTS.JS — تقارير مدير النظام
// كل التجميع يتم في الخادم؛ هذا الملف للعرض والتفاعل فقط.
// ============================================

let repState = {
    from: '', to: '', officer_id: '', department_id: '',
    violation_id: '', status: '', q: '', age_hours: '',
    sort: 'issued_id', dir: 'desc', page: 1, per_page: 25,
};

let repMeta   = null;
let repLast   = null;   // آخر استجابة — تُستخدم للطباعة والرسم
let repScoped = false;  // true لمدير القسم: الخادم يحصر النتائج على قسمه
let repLoaded = false;

// ============================================
// الفترات الجاهزة — تُحسب محلياً بتوقيت المستخدم
// ============================================

function ymd(d) {
    // لا نستخدم toISOString لأنها تحوّل إلى UTC فتُزيح اليوم
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function periodRange(key) {
    const now = new Date();
    const d   = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // الأسبوع يبدأ السبت (العُرف الليبي): السبت=6 في ترقيم getDay
    const toSaturday = (dt) => {
        const x = new Date(dt);
        x.setDate(x.getDate() - ((x.getDay() + 1) % 7));
        return x;
    };
    const shift = (dt, n) => { const x = new Date(dt); x.setDate(x.getDate() + n); return x; };

    switch (key) {
        case 'today':     return [ymd(d), ymd(d)];
        case 'yesterday': { const y = shift(d, -1); return [ymd(y), ymd(y)]; }
        case 'week':      { const s = toSaturday(d); return [ymd(s), ymd(d)]; }
        case 'lastweek':  { const s = shift(toSaturday(d), -7); return [ymd(s), ymd(shift(s, 6))]; }
        case 'month':     return [ymd(new Date(d.getFullYear(), d.getMonth(), 1)), ymd(d)];
        case 'lastmonth': {
            const s = new Date(d.getFullYear(), d.getMonth() - 1, 1);
            const e = new Date(d.getFullYear(), d.getMonth(), 0);
            return [ymd(s), ymd(e)];
        }
        case 'year':      return [ymd(new Date(d.getFullYear(), 0, 1)), ymd(d)];
        default:          return ['', ''];   // كل الفترات
    }
}

function applyPeriod(key) {
    const [from, to] = periodRange(key);
    document.getElementById('rp_from').value = from;
    document.getElementById('rp_to').value   = to;
    document.querySelectorAll('.period-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.period === key));
    repState.page = 1;
    runReport();
}

// عند تعديل التاريخ يدوياً تسقط صفة "فترة جاهزة"
function clearPeriodChips() {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
}

// ============================================
// تشغيل التقرير
// ============================================

/* صفحة مدير القسم لا تحتوي عناصر القسم (فهو محصور على قسمه في الخادم).
   هذه المساعِدات تجعل نفس الملف يخدم الصفحتين بلا انهيار. */
const $r  = id => document.getElementById(id);
const val = id => { const e = $r(id); return e ? e.value : ''; };

function collectFilters() {
    repState.from          = val('rp_from');
    repState.to            = val('rp_to');
    repState.officer_id    = val('rp_officer');
    repState.department_id = val('rp_department');
    repState.violation_id  = val('rp_violation');
    repState.status        = val('rp_status');
    repState.q             = val('rp_q').trim();
    /* «مضى عليها» — الفلتر الوحيد المحسوب من اللحظة لا من التاريخ:
       الخادم يقيس الفارق بالساعات من طابع (تاريخ + وقت) التحرير. */
    repState.age_hours     = val('rp_age');
}

async function runReport(keepPage) {
    collectFilters();
    if (!keepPage) repState.page = 1;

    const body = document.getElementById('repDetails');
    setTableLoading(body, 9);

    try {
        const res = await Reports.run(repState);
        if (res.status !== 'success') {
            body.innerHTML = '<tr><td class="empty-row" colspan="9">تعذّر تحميل التقرير</td></tr>';
            return;
        }
        repLast = res;
        updateActiveCount();
        renderScope();
        renderRepStats(res.summary);
        renderRepTables(res);
        renderRepDetails(res.details);
        requestAnimationFrame(() => drawTrend(res.timeline));
    } catch (_) {
        body.innerHTML = '<tr><td class="empty-row" colspan="9">حدث خطأ في الاتصال بالخادم</td></tr>';
    }
}

function resetReport() {
    ['rp_from','rp_to','rp_q'].forEach(id => document.getElementById(id).value = '');
    ['rp_officer','rp_department','rp_violation','rp_status','rp_age'].forEach(id => { const e = $r(id); if (e) e.value = ''; });
    // النص الظاهر للقوائم القابلة للبحث يُمسح معها وإلا بقي اسم مختار بلا أثر
    ['rp_officer_txt','rp_violation_txt'].forEach(id => { const e = $r(id); if (e) e.value = ''; });
    document.querySelectorAll('.period-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.period === 'all'));
    repState.sort = 'issued_id';
    repState.dir  = 'desc';
    markSortHeaders();
    runReport();
}

// ============================================
// طيّ لوحة الفلاتر
// ============================================

function toggleFilters() {
    const el = document.getElementById('repFilters');
    el.classList.toggle('open');
    localStorage.setItem('rep_filters_open', el.classList.contains('open') ? '1' : '0');
}

// عدد الفلاتر النشطة — يظهر على الرأس وهو مطوي
function updateActiveCount() {
    const n = ['from','to','officer_id','department_id','violation_id','status','q','age_hours']
        .filter(k => repState[k]).length;
    const badge = document.getElementById('repActiveCount');
    badge.textContent = n;
    badge.style.display = n > 0 ? '' : 'none';
}

// ============================================
// قائمة بحث واختيار — نفس نمط اختيار المخالفة عند الشرطي
// ============================================
/* القائمة المنسدلة العادية تُجبر المستخدم على تصفّح عشرات الضباط
   أو خمسة وعشرين نوع مخالفة بصرياً. هنا يكتب حرفين فتتقلّص القائمة.
   القيمة تُحفظ في input مخفي بنفس المعرّف القديم، فتبقى بقية
   الشيفرة (collectFilters و resetReport) تعمل بلا تغيير. */
function setupCombo(key, items) {
    const txt    = $r(`rp_${key}_txt`);
    const hidden = $r(`rp_${key}`);
    const list   = $r(`rp_${key}_list`);
    if (!txt || !hidden || !list) return;

    let shown  = [];
    let active = -1;

    const close = () => { list.classList.remove('show'); active = -1; };

    const labelOf = (id) => {
        const it = items.find(x => String(x.id) === String(id));
        return it ? it.label : '';
    };

    const paint = (q) => {
        const needle = q.trim().toLowerCase();
        shown = (needle ? items.filter(it => it.search.includes(needle)) : items).slice(0, 60);

        list.innerHTML = shown.length
            ? shown.map((it, i) => `
                <div class="combobox-item${i === active ? ' active' : ''}" data-i="${i}">
                    <div class="cb-text">
                        <span class="cb-desc">${escapeHtml(it.label)}</span>
                        ${it.sub ? `<span class="cb-article">${escapeHtml(it.sub)}</span>` : ''}
                    </div>
                </div>`).join('')
            : '<div class="combobox-empty">لا نتائج مطابقة</div>';
        list.classList.add('show');
    };

    const choose = (i) => {
        const it = shown[i];
        if (!it) return;
        hidden.value = it.id;
        txt.value    = it.label;
        close();
        runReport();
    };

    txt.addEventListener('focus', () => paint(''));

    txt.addEventListener('input', () => {
        // إفراغ الخانة يعني «الكل» — لا حاجة لخيار منفصل
        if (txt.value.trim() === '' && hidden.value !== '') {
            hidden.value = '';
            runReport();
        }
        paint(txt.value);
    });

    txt.addEventListener('keydown', e => {
        if (!list.classList.contains('show')) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault(); active = Math.min(active + 1, shown.length - 1); paint(txt.value);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault(); active = Math.max(active - 1, 0); paint(txt.value);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (active >= 0) choose(active);
            else if (shown.length === 1) choose(0);
            else close();
        } else if (e.key === 'Escape') {
            close();
        }
    });

    // mousedown لا blur: يمنع فقدان التركيز قبل تسجيل الاختيار
    list.addEventListener('mousedown', e => {
        const item = e.target.closest('.combobox-item');
        if (!item) return;
        e.preventDefault();
        choose(Number(item.dataset.i));
    });

    // نص لا يطابق اختياراً يُعاد لآخر قيمة صالحة، فلا يتناقض المعروض مع المطبَّق
    txt.addEventListener('blur', () => {
        setTimeout(() => { txt.value = labelOf(hidden.value); close(); }, 120);
    });

    document.addEventListener('click', e => {
        if (!e.target.closest(`#cb_${key}`)) close();
    });
}

// ============================================
// شريط نطاق التقرير — يمنع قراءة الأرقام خارج سياقها
// ============================================

function renderScope() {
    const bits = [];
    // القوائم صارت مزيجاً: select عادي، و input مخفي بجواره نص ظاهر
    const name = (id) => {
        const el = document.getElementById(id);
        if (!el || !el.value) return '';
        if (el.tagName === 'SELECT') return el.options[el.selectedIndex].text;
        const txt = document.getElementById(id + '_txt');
        return txt ? txt.value : el.value;
    };

    if (repState.from || repState.to) {
        bits.push(`الفترة: ${repState.from || '…'} ← ${repState.to || '…'}`);
    } else {
        bits.push('الفترة: كل التواريخ');
    }
    if (repState.officer_id)    bits.push('الضابط: ' + name('rp_officer'));
    if (repState.department_id) bits.push('القسم: ' + name('rp_department'));
    if (repState.violation_id)  bits.push('النوع: ' + name('rp_violation'));
    if (repState.status)        bits.push('الحالة: ' + name('rp_status'));
    if (repState.q)             bits.push('بحث: ' + repState.q);

    const el = document.getElementById('repScope');
    el.innerHTML = '<strong>نطاق التقرير</strong>' +
        bits.map(b => `<span class="chip">${escapeHtml(b)}</span>`).join('');
    el.classList.add('show');
}

// ============================================
// البطاقات الإحصائية
// ============================================

/* خلية قياس واحدة داخل كشف الملخّص.
   بلا أيقونة وبلا لون خاص: الرقم بيان لا زينة، والتمييز بالحجم
   والوزن والمحاذاة لا بالصبغ. */
function repMetric(label, value, unit, sub) {
    return `
    <div class="rep-metric">
        <div class="rm-label">${label}</div>
        <div class="rm-value">${value}${unit ? `<span class="rm-unit">${unit}</span>` : ''}</div>
        ${sub ? `<div class="rm-sub">${sub}</div>` : ''}
    </div>`;
}

/** الرقم وحده — الوحدة تُفصل لتُنسَّق أصغر وأهدأ. */
function amount(n) {
    return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function money(n) {
    return amount(n) + ' د.ل';
}

function renderRepStats(s) {
    const rate      = s.tickets > 0 ? Math.round((s.paid / s.tickets) * 100) : 0;
    const total     = Number(s.total_fines || 0);
    const collected = Number(s.collected   || 0);
    /* نسبة التحصيل بالمبلغ لا بعدد التذاكر — رقمان مختلفان:
       قد تُسدَّد نصف التذاكر وهي الأرخص، فتبقى أكثر الأموال معلّقة. */
    const cashRate  = total > 0 ? (collected / total) * 100 : 0;
    const pct       = cashRate.toFixed(1).replace(/\.0$/, '');

    document.getElementById('repStats').innerHTML = `
    <div class="rep-summary">
        <div class="rep-metrics">
            ${repMetric('إجمالي المخالفات', s.tickets, '', `${s.violation_lines} بند مخالفة`)}
            ${repMetric('مدفوعة',           s.paid,    '', `${rate}٪ من الإجمالي`)}
            ${repMetric('معلّقة',            s.pending, '', `${100 - rate}٪ من الإجمالي`)}
            ${repMetric('إجمالي الغرامات',   amount(s.total_fines), ' د.ل', `متوسط ${money(s.avg_fine)}`)}
            ${repMetric('المحصّل',           amount(s.collected),   ' د.ل')}
            ${repMetric('المتبقي',           amount(s.outstanding), ' د.ل')}
        </div>
        <div class="rep-rate">
            <div class="rr-head">
                <span class="rr-title">نسبة التحصيل من إجمالي الغرامات</span>
                <span class="rr-pct">${pct}٪</span>
            </div>
            <div class="rr-bar" role="img"
                 aria-label="حُصّل ${pct} بالمئة من إجمالي الغرامات">
                <span class="rr-fill" style="width:${cashRate.toFixed(2)}%"></span>
            </div>
            <div class="rr-legend">
                <span><i class="rr-dot rr-dot-paid"></i>محصّل ${money(s.collected)}</span>
                <span><i class="rr-dot rr-dot-due"></i>متبقٍ ${money(s.outstanding)}</span>
            </div>
        </div>
    </div>`;
}

// ============================================
// الجداول التحليلية
// ============================================

/* الجداول اختيارية: صفحة مدير النظام أُزيلت منها لتقليل التشتيت،
   وصفحة مدير القسم ما زالت تعرضها. كل جدول يُملأ إن وُجد فقط. */
function fillTable(id, rows, cols, rowFn) {
    const tb = $r(id);
    if (!tb) return;
    tb.innerHTML = (rows || []).map(rowFn).join('') || emptyRow(cols);
}

function renderRepTables(r) {
    /* العمود الثالث يختلف: «القسم» لمدير النظام، و«الرتبة» لمدير القسم
       (كل ضباطه في قسم واحد فلا معنى لتكراره). */
    const col3 = repScoped
        ? { label: 'الرتبة', pick: o => o.officer_rank }
        : { label: 'القسم',  pick: o => o.department_name };

    fillTable('repByOfficer', r.by_officer, 6, o => `
        <tr>
            <td data-label="الضابط">${escapeHtml(o.officer_name) || '—'}</td>
            <td data-label="الرقم">${escapeHtml(o.employee_no) || '—'}</td>
            <td data-label="${col3.label}">${escapeHtml(col3.pick(o)) || '—'}</td>
            <td data-label="المخالفات">${o.tickets}</td>
            <td data-label="مدفوعة">${o.paid}</td>
            <td data-label="إجمالي الغرامات">${money(o.total_fines)}</td>
        </tr>`);

    fillTable('repByViolation', r.by_violation, 4, v => `
        <tr>
            <td data-label="المادة">${escapeHtml(v.violation_article) || '—'}</td>
            <td data-label="الوصف">${escapeHtml(v.violation_description) || '—'}</td>
            <td data-label="التكرار">${v.times}</td>
            <td data-label="إجمالي الغرامات">${money(v.total_fines)}</td>
        </tr>`);

    fillTable('repByDepartment', r.by_department, 4, d => `
        <tr>
            <td data-label="القسم">${escapeHtml(d.department_name) || '—'}</td>
            <td data-label="المخالفات">${d.tickets}</td>
            <td data-label="مدفوعة">${d.paid}</td>
            <td data-label="إجمالي الغرامات">${money(d.total_fines)}</td>
        </tr>`);

    fillTable('repByMethod', r.by_method, 3, m => `
        <tr>
            <td data-label="الطريقة">${escapeHtml(methodNames[m.payment_method] || m.payment_method)}</td>
            <td data-label="عدد العمليات">${m.operations}</td>
            <td data-label="المحصّل">${money(m.collected)}</td>
        </tr>`);
}

// ============================================
// السجل التفصيلي
// ============================================

/* معرّف المركبة في عمود واحد: اللوحة إن وُجدت، وإلا رقم الهيكل
   موسوماً صراحةً — بلا الوسم يُقرأ رقم الهيكل على أنه لوحة. */
function vehicleId(r) {
    const plate = (r.plate_no || '').trim();
    if (plate) return escapeHtml(plate);

    const chassis = (r.chassis_no || '').trim();
    if (!chassis) return '—';
    return `${escapeHtml(chassis)} <span class="v-more">هيكل</span>`;
}

function renderRepDetails(d) {
    document.getElementById('repCount').textContent = d.total;

    /* التلميح كان في سمة title فقط — أي لا يظهر إلا بالتحويم،
       وكبار السن قد لا يكتشفونه أبداً. صار سطراً ظاهراً دائماً. */
    const hint = $r('repHint');
    if (hint) hint.hidden = !(d.rows || []).length;

    /* صفحة مدير القسم لا تعرض عمود «القسم» — نتائجه محصورة في قسمه
       فالعمود مكرّر بلا فائدة. لا بدّ أن يتبع عدد الخلايا عدد الرؤوس،
       وإلا انزاحت كل قيمة عموداً واحداً. */
    const deptTh = repScoped ? 0 : 1;

    document.getElementById('repDetails').innerHTML = (d.rows || []).map(r => {
        const extra = r.violations_count > 1
            ? `<span class="v-more">${r.violations_count}</span>` : '';
        const deptCell = repScoped ? ''
            : `<td data-label="القسم">${escapeHtml(r.department_name) || '—'}</td>`;
        return `
        <tr class="tk-row" data-id="${r.issued_id}" title="انقر مرتين لعرض التفاصيل الكاملة">
            <td data-label="#">${r.issued_id}</td>
            <td data-label="التاريخ">${r.issued_date || '—'}<br>
                <span style="font-size:11px;color:var(--color-text-faint)">${formatTime12(r.issued_time)}</span></td>
            <td data-label="الضابط">${escapeHtml(r.officer_name) || '—'}</td>
            ${deptCell}
            <td data-label="السائق">${escapeHtml(r.driver_name) || '—'}</td>
            <td data-label="اللوحة / الهيكل">${vehicleId(r)}</td>
            <td data-label="المخالفات">${escapeHtml(r.violations_text) || '—'}${extra}</td>
            <td data-label="الغرامة">${money(r.fine)}</td>
            <td data-label="الحالة">${statusBadge(r.violation_status)}</td>
        </tr>`;
    }).join('') || emptyRow(8 + deptTh, 'لا توجد نتائج مطابقة للفلاتر المحددة');

    renderPager(d);
}

// ============================================
// تفاصيل مخالفة واحدة — نقر مزدوج على الصف
// ============================================

function bindRowOpen() {
    const tb = $r('repDetails');
    if (!tb || tb.dataset.bound) return;
    tb.dataset.bound = '1';          // مرة واحدة — الجدول يُعاد بناؤه لا العنصر
    tb.addEventListener('dblclick', e => {
        const tr = e.target.closest('.tk-row');
        if (tr) openTicket(tr.dataset.id);
    });

    // إغلاق: بالنقر خارج البطاقة أو بمفتاح Escape
    const modal = $r('ticketModal');
    if (modal) {
        modal.addEventListener('click', e => {
            if (e.target === modal) modal.classList.remove('show');
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') modal.classList.remove('show');
        });
    }
}

async function openTicket(id) {
    const modal = $r('ticketModal');
    const body  = $r('ticketBody');
    if (!modal || !body) return;

    body.innerHTML = '<div class="tk-loading">جارٍ التحميل…</div>';
    modal.classList.add('show');

    try {
        const res = await Reports.detail(id);
        if (res.status !== 'success') {
            body.innerHTML = `<div class="tk-loading">${escapeHtml(res.message || 'تعذّر جلب التفاصيل')}</div>`;
            return;
        }
        body.innerHTML = renderTicket(res.data);
    } catch (_) {
        body.innerHTML = '<div class="tk-loading">حدث خطأ في الاتصال بالخادم</div>';
    }
}

function renderTicket(t) {
    const dash = v => (v === 0 || v) && String(v).trim() !== '' ? escapeHtml(v) : '—';

    // صف حقل — يُحذف كلياً إن كانت قيمته فارغة
    const f = (label, v) => {
        const s = (v === 0 || v) && String(v).trim() !== '' ? escapeHtml(v) : null;
        return s ? `<div class="tk-f"><span>${label}</span><b>${s}</b></div>` : '';
    };

    const sec = (title, inner) =>
        inner.trim() ? `<div class="tk-sec"><h4>${title}</h4><div class="tk-grid">${inner}</div></div>` : '';

    const vRows = (t.violations || []).map((v, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${dash(v.violation_article)}</td>
            <td>${dash(v.violation_description)}</td>
            <td class="tk-num">${money(v.fine_amount)}</td>
        </tr>`).join('');

    const p = t.payment;
    const payment = p ? sec('الدفع',
          f('الطريقة', methodNames[p.payment_method] || p.payment_method)
        + f('المبلغ', money(p.amount))
        + f('التاريخ', p.payment_date)
        + f('الساعة', formatTime12(p.payment_time))
        + f('نفّذها', p.processed_by_username)
    ) : '';

    return `
    <div class="tk-head">
        <div>
            <div class="tk-eyebrow">مخالفة رقم</div>
            <div class="tk-id">${t.issued_id}</div>
        </div>
        <div class="tk-head-l">
            ${statusBadge(t.violation_status)}
            <div class="tk-total">${money(t.total_fine)}</div>
        </div>
    </div>

    ${sec('الضبط',
          f('التاريخ', t.issued_date)
        + f('الساعة', formatTime12(t.issued_time))
        + f('الموقع', t.location))}

    ${sec('المحرِّر',
          f('الاسم', t.officer_name)
        + f('الرقم', t.employee_no)
        + f('الرتبة', t.officer_rank)
        + f('التابع', t.officer_unit)
        + f('القسم', t.department_name)
        + f('المديرية', t.directorate))}

    ${sec('المركبة',
          f('رقم اللوحة', t.plate_no)
        + f('رقم الهيكل', t.chassis_no)
        + f('النوع', t.vehicle_type))}

    ${sec('السائق',
          f('الاسم', t.driver_name)
        + f('المهنة', t.driver_job)
        + f('رقم الرخصة', t.license_no)
        + f('فئة الرخصة', t.license_class)
        + f('جهة الإصدار', t.license_issue)
        + f('البطاقة الشخصية', t.identity_card))}

    <div class="tk-sec">
        <h4>المخالفات المرتكبة (${(t.violations || []).length})</h4>
        <div class="table-wrapper">
            <table class="tk-table">
                <thead><tr><th>#</th><th>المادة</th><th>الوصف</th><th>الغرامة</th></tr></thead>
                <tbody>${vRows || '<tr><td colspan="4" class="empty-row">لا توجد بنود</td></tr>'}</tbody>
            </table>
        </div>
    </div>

    ${payment}`;
}

function renderPager(d) {
    const el = document.getElementById('repPager');
    if (d.pages <= 1) {
        el.innerHTML = d.total > 0
            ? `<span class="pager-info">عرض ${d.total} نتيجة</span>` : '';
        return;
    }

    const btn = (label, page, opts = {}) =>
        `<button ${opts.disabled ? 'disabled' : ''} class="${opts.active ? 'active' : ''}"
                 onclick="gotoRepPage(${page})">${label}</button>`;

    let html = btn('«', d.page - 1, { disabled: d.page === 1 });

    // نافذة صفحات حول الصفحة الحالية
    const win = 2;
    let start = Math.max(1, d.page - win);
    let end   = Math.min(d.pages, d.page + win);
    if (start > 1)      html += btn(1, 1) + (start > 2 ? '<span class="pager-info">…</span>' : '');
    for (let i = start; i <= end; i++) html += btn(i, i, { active: i === d.page });
    if (end < d.pages)  html += (end < d.pages - 1 ? '<span class="pager-info">…</span>' : '') + btn(d.pages, d.pages);

    html += btn('»', d.page + 1, { disabled: d.page === d.pages });
    html += `<span class="pager-info">صفحة ${d.page} من ${d.pages} — ${d.total} نتيجة</span>`;
    el.innerHTML = html;
}

function gotoRepPage(p) {
    repState.page = p;
    runReport(true);
    document.getElementById('repDetails').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ============================================
// الفرز
// ============================================

function markSortHeaders() {
    document.querySelectorAll('#tab-reports th.sortable').forEach(th => {
        th.classList.remove('asc', 'desc');
        if (th.dataset.sort === repState.sort) th.classList.add(repState.dir);
    });
}

function bindSorting() {
    document.querySelectorAll('#tab-reports th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.dataset.sort;
            if (repState.sort === key) {
                repState.dir = repState.dir === 'asc' ? 'desc' : 'asc';
            } else {
                repState.sort = key;
                repState.dir  = 'desc';
            }
            markSortHeaders();
            repState.page = 1;
            runReport(true);
        });
    });
}

// ============================================
// رسم الاتجاه الزمني — Canvas خام
// ============================================

function drawTrend(rows) {
    const canvas = document.getElementById('repTrend');
    if (!canvas) return;
    const wrap = canvas.parentElement;
    const W = wrap.offsetWidth || 600;
    const H = wrap.offsetHeight || 190;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const cs = getComputedStyle(document.documentElement);
    const accent = cs.getPropertyValue('--color-accent').trim() || '#1D4ED8';
    const muted  = cs.getPropertyValue('--color-text-faint').trim() || '#888';
    const grid   = cs.getPropertyValue('--color-border').trim() || '#ddd';

    if (!rows || !rows.length) {
        ctx.fillStyle = muted;
        ctx.font = '13px IBM Plex Sans Arabic, Arial';
        ctx.textAlign = 'center';
        ctx.fillText('لا توجد بيانات في هذا النطاق', W / 2, H / 2);
        return;
    }

    const padT = 20, padB = 34, padR = 14, padL = 40;
    const cW = W - padL - padR;
    const cH = H - padT - padB;
    const vals = rows.map(r => Number(r.tickets));
    const maxV = Math.max(...vals, 1);

    // خطوط شبكية أفقية + محور القيم
    ctx.font = '10px IBM Plex Sans Arabic, Arial';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (let i = 0; i <= 4; i++) {
        const y = padT + cH - (cH * i / 4);
        ctx.strokeStyle = grid;
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = muted;
        ctx.fillText(Math.round(maxV * i / 4), 6, y);
    }

    const n    = rows.length;
    const slot = cW / n;
    const barW = Math.min(Math.max(slot * 0.55, 6), 46);

    ctx.textAlign = 'center';
    rows.forEach((r, i) => {
        const v  = Number(r.tickets);
        const x  = padL + i * slot + slot / 2;
        const bh = (v / maxV) * cH;
        const y  = padT + cH - bh;

        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.85;
        const rad = Math.min(4, barW / 2);
        ctx.beginPath();
        ctx.moveTo(x - barW / 2, y + bh);
        ctx.lineTo(x - barW / 2, y + rad);
        ctx.quadraticCurveTo(x - barW / 2, y, x - barW / 2 + rad, y);
        ctx.lineTo(x + barW / 2 - rad, y);
        ctx.quadraticCurveTo(x + barW / 2, y, x + barW / 2, y + rad);
        ctx.lineTo(x + barW / 2, y + bh);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;

        // القيمة فوق العمود — تُخفى لو ازدحمت الأعمدة
        if (slot > 26) {
            ctx.fillStyle = accent;
            ctx.font = 'bold 10px IBM Plex Sans Arabic, Arial';
            ctx.fillText(v, x, y - 6);
        }

        // تسميات المحور — نُظهر عيّنة فقط عند الازدحام
        const step = Math.ceil(n / Math.max(Math.floor(cW / 62), 1));
        if (i % step === 0) {
            ctx.fillStyle = muted;
            ctx.font = '10px IBM Plex Sans Arabic, Arial';
            const lbl = String(r.bucket).length > 7 ? String(r.bucket).slice(5) : String(r.bucket);
            ctx.fillText(lbl, x, H - padB + 14);
        }
    });
}

// ============================================
// الطباعة
// ============================================

/* كانت الطباعة تُخرج صفحة بيضاء: قاعدة في components.css كانت تُخفي
   كل شيء عدا #receiptArea — وصفحة التقارير لا إيصال فيها.
   صارت تلك القاعدة محصورة بصنف يُضاف وقت طباعة الإيصال فقط. */
function printReport() {
    if (!repLast) {
        showMsg('repMsg', 'لا توجد نتائج للطباعة', 'error');
        return;
    }
    // اطبع اللوحة مفتوحة أو مطوية دون تغيير تفضيل المستخدم
    const filters = $r('repFilters');
    const wasOpen = filters && filters.classList.contains('open');
    if (wasOpen) filters.classList.remove('open');

    const restore = () => { if (wasOpen) filters.classList.add('open'); };
    window.addEventListener('afterprint', restore, { once: true });

    window.print();
    setTimeout(restore, 1500);
}

// ============================================
// التهيئة
// ============================================

async function loadReportsTab() {
    if (repLoaded) return;      // التبويب يُهيَّأ مرة واحدة
    repLoaded = true;

    try {
        repMeta = await Reports.meta();
        repScoped = !!repMeta.scoped;
        if (repMeta.status === 'success') {
            setupCombo('officer', repMeta.officers.map(o => ({
                id:     o.officer_id,
                label:  o.officer_name,
                sub:    o.employee_no ? 'الرقم الوظيفي ' + o.employee_no : '',
                search: `${o.officer_name || ''} ${o.employee_no || ''} ${o.department_name || ''}`.toLowerCase(),
            })));

            setupCombo('violation', repMeta.violations.map(v => ({
                id:     v.violation_id,
                label:  v.violation_description || v.violation_article,
                sub:    v.violation_article,
                search: `${v.violation_description || ''} ${v.violation_article || ''}`.toLowerCase(),
            })));

            const depSel = $r('rp_department');
            if (depSel) depSel.innerHTML =
                '<option value="">كل الأقسام</option>' +
                repMeta.departments.map(d =>
                    `<option value="${d.department_id}">${escapeHtml(d.department_name)}</option>`
                ).join('');
        }
    } catch (_) { /* القوائم تبقى فارغة، التقرير يعمل بلا فلاتر */ }

    document.querySelectorAll('.period-btn').forEach(b =>
        b.addEventListener('click', () => applyPeriod(b.dataset.period)));

    ['rp_from','rp_to'].forEach(id =>
        document.getElementById(id).addEventListener('change', () => { clearPeriodChips(); runReport(); }));

    ['rp_officer','rp_department','rp_violation','rp_status','rp_age'].forEach(id => {
        const e = $r(id);
        if (e) e.addEventListener('change', () => runReport());
    });

    // بحث فوري مع تهدئة
    let t = null;
    document.getElementById('rp_q').addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => runReport(), 400);
    });

    // يتذكّر إن كان المستخدم طوى اللوحة سابقاً
    if (localStorage.getItem('rep_filters_open') === '0') {
        document.getElementById('repFilters').classList.remove('open');
    }

    bindSorting();
    bindRowOpen();
    markSortHeaders();
    runReport();

    // إعادة رسم المخطط عند تغيّر المقاس أو المظهر
    let rt = null;
    window.addEventListener('resize', () => {
        clearTimeout(rt);
        rt = setTimeout(() => { if (repLast) drawTrend(repLast.timeline); }, 200);
    });
}
