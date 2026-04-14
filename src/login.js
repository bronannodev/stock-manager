import { checkSession, login } from './modules/auth.js';

const loginForm = document.getElementById('login-form');
const errorDiv = document.getElementById('login-error');
const submitBtn = document.getElementById('btn-submit');

// 1. Si ya está logueado, redirigir al dashboard 
async function init() {
    const session = await checkSession();
    if (session) {
        window.location.href = 'dashboard.html';
    }
}

// 2. Manejar envío del formulario
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.classList.add('hidden');
    submitBtn.textContent = 'Verificando...';
    submitBtn.disabled = true;

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        await login(email, password);
        window.location.href = 'dashboard.html'; // Redirigir al éxito
    } catch (error) {
        errorDiv.textContent = 'Error: Credenciales inválidas.';
        errorDiv.classList.remove('hidden');
        submitBtn.textContent = 'Ingresar';
        submitBtn.disabled = false;
    }
});

init();