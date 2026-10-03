
async function handleLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const btn      = document.getElementById('loginBtn');

    if (!username || !password) {
        return showMsg('errorMsg', 'يرجى إدخال اسم المستخدم وكلمة المرور', 'error');
    }

    if (btn && btn.disabled) return;

    setLoading(btn, true);
    try {
        const data = await login(username, password);
        if (data.status !== 'success') showMsg('errorMsg', data.message, 'error');
    } catch (err) {
        showMsg('errorMsg', 'حدث خطأ في الاتصال بالسيرفر', 'error');
    } finally {
        setLoading(btn, false);
    }
}

document.addEventListener('keypress', e => {
    if (e.key === 'Enter') handleLogin();
});
