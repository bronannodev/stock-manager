// --- PWA Service Worker Registration ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
            console.log('SW Registration failed: ', err);
        });
    });
}

import { checkSession, logout } from './modules/auth.js';
import { getProducts, createProduct, updateProduct, deleteProduct } from './modules/products.js';
import { getExpenses, createExpense, deleteExpense } from './modules/expenses.js';
import { getCategories, createCategory, updateCategory, deleteCategory } from './modules/categories.js';
import { getSuppliers, createSupplier } from './modules/suppliers.js';
import { processSale, getDashboardStats, getAdvancedStats, getSalesHistory, revertSale } from './modules/sales.js';

const ui = {
    loadingOverlay: document.getElementById('loading-overlay'),
    userEmail: document.getElementById('user-email'),
    logoutBtn: document.getElementById('logout-btn'),
    navBtns: document.querySelectorAll('.nav-btn'),
    sections: document.querySelectorAll('.view-section'),
    productsTableBody: document.getElementById('products-table-body'),
    saleProductSelect: document.getElementById('sale-product-select'),
    cartBody: document.getElementById('cart-body'),
    btnConfirmSale: document.getElementById('btn-confirm-sale'),
    mobileMenuBtn: document.getElementById('mobile-menu-btn'),
    sidebar: document.getElementById('sidebar'),
    mobileOverlay: document.getElementById('mobile-overlay')
};

let state = { products: [], cart: [], expenses: [], suppliers: [], categories: [], salesHistory: [], currentSalesFilter: 'week' };

// --- COMPONENTES GLOBALES (Toasts & Modales) ---
window.showToast = (message, type = 'success') => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    
    const styles = {
        success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
        error:   'bg-red-50 border-red-200 text-red-800',
        warning: 'bg-amber-50 border-amber-200 text-amber-800',
    };
    const icons = {
        success: `<svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`,
        error:   `<svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
        warning: `<svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`,
    };
    const colorClass = styles[type] || styles.success;
    const icon = icons[type] || icons.success;
    
    toast.className = `toast-in flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-lg border text-sm font-medium pointer-events-auto ${colorClass}`;
    toast.innerHTML = `${icon}<span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.replace('toast-in', 'toast-out');
        setTimeout(() => toast.remove(), 350);
    }, 3500);
};

window.openModal = (modalId) => {
    const overlay = document.getElementById('global-modal');
    const modal = document.getElementById(modalId);
    if (!overlay || !modal) return;
    
    document.querySelectorAll('.modal-content').forEach(m => m.classList.add('hidden'));
    
    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');
    
    // Spring animation
    modal.classList.remove('modal-spring-in');
    void modal.offsetWidth; // Reflow para reiniciar
    modal.classList.add('modal-spring-in');
    
    setTimeout(() => {
        overlay.classList.remove('opacity-0', 'pointer-events-none');
        modal.classList.remove('scale-95');
    }, 10);
};

window.closeModal = () => {
    const overlay = document.getElementById('global-modal');
    if (!overlay) return;
    
    overlay.classList.add('opacity-0', 'pointer-events-none');
    document.querySelectorAll('.modal-content').forEach(m => m.classList.add('scale-95'));
    
    setTimeout(() => {
        overlay.classList.add('hidden');
        document.querySelectorAll('.modal-content').forEach(m => m.classList.add('hidden'));
    }, 300);
};

window.closeConfirmModal = () => {
    window.closeModal();
};

window.showConfirm = (title, message, callback) => {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-desc').textContent = message;
    
    const btn = document.getElementById('btn-confirm-action');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.addEventListener('click', async () => {
        newBtn.disabled = true;
        newBtn.innerHTML = 'Procesando...';
        await callback();
        newBtn.disabled = false;
        newBtn.innerHTML = 'Sí, Confirmar';
        window.closeConfirmModal();
    });

    window.openModal('modal-confirm');
};

// 1. Guardián de Autenticación
async function init() {
    const session = await checkSession();
    
    if (!session) {
        // Si no hay sesión, expulsar al login
        window.location.href = 'index.html';
        return;
    }

    // Inicializar UI si está autorizado
    ui.userEmail.textContent = session.user.email;
    ui.loadingOverlay.style.display = 'none'; // Quitar pantalla de carga
    
    bindEvents();
    loadProducts();
    loadSuppliers();
    loadCategories();
    loadExpenses();
}

// 2. Asignar Eventos
function bindEvents() {
    ui.logoutBtn.addEventListener('click', async () => {
        await logout();
        window.location.href = 'index.html';
    });

    ui.navBtns.forEach(btn => btn.addEventListener('click', (e) => switchTab(e.currentTarget.dataset.target)));
    
    document.getElementById('form-product').addEventListener('submit', handleCreateProduct);
    document.getElementById('form-expense').addEventListener('submit', handleCreateExpense);
    document.getElementById('form-supplier').addEventListener('submit', handleCreateSupplier);
    document.getElementById('form-category').addEventListener('submit', handleCreateCategory);
    document.getElementById('form-stock').addEventListener('submit', handleAddStock);
    
    document.getElementById('btn-add-to-cart').addEventListener('click', addToCart);
    ui.btnConfirmSale.addEventListener('click', handleCheckout);
    document.getElementById('btn-refresh-dash').addEventListener('click', loadDashboard);

    if (ui.mobileMenuBtn) {
        ui.mobileMenuBtn.addEventListener('click', toggleMobileMenu);
        ui.mobileOverlay.addEventListener('click', closeMobileMenu);
    }

    // Marcar el primer botón del nav como activo al inicio
    const firstNav = ui.navBtns[0];
    if (firstNav) firstNav.classList.add('nav-active');
}

// 2.5 Lógica Menú Móvil
function toggleMobileMenu() {
    ui.sidebar.classList.toggle('-translate-x-full');
    ui.mobileOverlay.classList.toggle('hidden');
    ui.mobileOverlay.classList.toggle('pointer-events-none');
    setTimeout(() => ui.mobileOverlay.classList.toggle('opacity-0'), 10);
}

function closeMobileMenu() {
    ui.sidebar.classList.add('-translate-x-full');
    ui.mobileOverlay.classList.add('opacity-0');
    ui.mobileOverlay.classList.add('pointer-events-none');
    setTimeout(() => ui.mobileOverlay.classList.add('hidden'), 300);
}

// 3. Navegación de Pestañas
function switchTab(targetId) {
    ui.sections.forEach(sec => {
        sec.classList.add('hidden');
        sec.classList.remove('section-enter');
    });
    const activeSection = document.getElementById(targetId);
    activeSection.classList.remove('hidden');
    // Reactivar animación de entrada
    void activeSection.offsetWidth;
    activeSection.classList.add('section-enter');
    
    // Nav active indicator
    ui.navBtns.forEach(btn => {
        btn.classList.remove('nav-active', 'bg-stone-800', 'text-white');
        btn.classList.add('hover:bg-stone-800', 'hover:text-white');
        if (btn.dataset.target === targetId) {
            btn.classList.add('nav-active');
            btn.classList.remove('hover:bg-stone-800', 'hover:text-white');
        }
    });

    if (ui.mobileMenuBtn && window.innerWidth < 768) {
        closeMobileMenu();
    }

    if (targetId === 'view-dashboard') loadDashboard();
    if (targetId === 'view-sales-history') {
        window.filterSales(state.currentSalesFilter);
    }
}

// 4. Lógica de Productos
async function loadProducts() {
    try {
        state.products = await getProducts();
        renderProductsTable();
        renderProductSelect();
    } catch (error) {
        showToast('Error cargando productos. Revisa la consola.', 'error');
        console.error(error);
    }
}

function renderProductsTable() {
    const tableBody = document.getElementById('products-table-body');
    const cardsBody = document.getElementById('products-cards-body');
    
    if (!tableBody || !cardsBody) return;

    if (state.products.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-stone-400">Tu catálogo está vacío.</td></tr>`;
        cardsBody.innerHTML = `<div class="p-8 text-center text-stone-400 bg-white rounded-3xl border border-stone-100">Tu catálogo está vacío.</div>`;
        return;
    }

    tableBody.innerHTML = state.products.map(p => {
        const isLowStock = p.stock < 5;
        const stockEl = isLowStock
            ? `<span class="badge-stock-critical text-red-600 font-bold text-sm">${p.stock}</span>`
            : `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${ p.stock < 15 ? 'bg-amber-50 text-amber-700' : 'bg-stone-100 text-stone-600' }">${p.stock}</span>`;
        return `
        <tr class="table-row-anim border-b border-stone-50">
            <td class="p-4 font-medium">${p.name}</td>
            <td class="p-4 capitalize text-stone-500 text-sm">${p.category || '-'}</td>
            <td class="p-4"><span class="bg-amber-50 text-amber-600 font-bold px-2 py-1 rounded-lg text-sm">$${p.cost}</span></td>
            <td class="p-4"><span class="bg-emerald-50 text-emerald-600 font-bold px-2 py-1 rounded-lg text-sm drop-shadow-sm">$${p.price}</span></td>
            <td class="p-4">${stockEl}</td>
            <td class="p-4">
                <div class="flex items-center gap-2 justify-end">
                    <button onclick="window.openStockModal('${p.id}')" class="p-1.5 bg-emerald-50 text-emerald-500 rounded-lg hover:bg-emerald-100 transition-colors" title="Ingresar Stock">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                    </button>
                    <button onclick="window.editProduct('${p.id}')" class="p-1.5 bg-indigo-50 text-indigo-500 rounded-lg hover:bg-indigo-100 transition-colors" title="Editar">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    </button>
                    <button onclick="window.deleteProduct('${p.id}')" class="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors" title="Eliminar">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
    
    // Render Cards (Mobile)
    cardsBody.innerHTML = state.products.map(p => `
        <div class="bg-white p-5 rounded-3xl shadow-sm border border-stone-100 flex flex-col gap-3">
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="font-bold text-stone-900 text-lg leading-tight mb-1">${p.name}</h3>
                    <span class="text-xs uppercase tracking-wider font-semibold text-stone-500">${p.category || 'Sin categoría'}</span>
                </div>
                <span class="px-2.5 py-1 bg-stone-100 rounded-lg text-sm font-bold ${p.stock < 5 ? 'text-red-600 bg-red-50' : 'text-stone-700'}">Stock: ${p.stock}</span>
            </div>
            
            <div class="flex items-center gap-4 py-2 border-y border-stone-50">
                <div>
                    <p class="text-[10px] uppercase font-bold text-stone-400 mb-0.5">Costo</p>
                    <span class="bg-amber-50 text-amber-600 font-bold px-2 py-0.5 rounded-md text-sm drop-shadow-sm">$${p.cost}</span>
                </div>
                <div>
                    <p class="text-[10px] uppercase font-bold text-stone-400 mb-0.5">Precio Venta</p>
                    <span class="bg-emerald-50 text-emerald-600 font-bold px-2 py-0.5 rounded-md text-sm drop-shadow-sm">$${p.price}</span>
                </div>
            </div>

            <div class="flex justify-end gap-2 pt-1">
                <button onclick="window.openStockModal('${p.id}')" class="flex-1 p-2 bg-emerald-50 text-emerald-600 font-medium rounded-xl hover:bg-emerald-100 transition-colors flex justify-center items-center gap-2" title="Ingresar Stock">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                    Stock
                </button>
                <button onclick="window.editProduct('${p.id}')" class="flex-1 p-2 bg-indigo-50 text-indigo-500 font-medium rounded-xl hover:bg-indigo-100 transition-colors flex justify-center items-center gap-2" title="Editar">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    Editar
                </button>
                <button onclick="window.deleteProduct('${p.id}')" class="w-12 p-2 bg-red-50 text-red-500 font-medium rounded-xl hover:bg-red-100 transition-colors flex justify-center items-center" title="Eliminar">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        </div>
    `).join('');
}

window.editProduct = (id) => {
    const product = state.products.find(p => p.id === id);
    if (!product) return;
    
    document.getElementById('prod-id').value = product.id;
    document.getElementById('prod-name').value = product.name;
    document.getElementById('prod-cost').value = product.cost;
    document.getElementById('prod-price').value = product.price;
    document.getElementById('prod-category').value = product.category || '';
    
    document.querySelector('#modal-product h3').textContent = 'Editar Producto';
    document.querySelector('#form-product button[type="submit"]').textContent = 'Actualizar Catálogo';
    
    window.openModal('modal-product');
};

window.deleteProduct = async (id) => {
    window.showConfirm(
        'Eliminar Producto',
        '¿Estás seguro de que deseas eliminar este producto (No se puede rehacer)?',
        async () => {
            try {
                await deleteProduct(id);
                window.showToast('Producto eliminado', 'success');
                await loadProducts();
            } catch (error) {
                window.showToast('Error al eliminar producto', 'error');
                console.error(error);
            }
        }
    );
};

async function handleCreateProduct(e) {
    e.preventDefault();
    const btnSubmit = e.target.querySelector('button[type="submit"]');    
    const id = document.getElementById('prod-id').value;
    const name = document.getElementById('prod-name').value;
    const cost = parseFloat(document.getElementById('prod-cost').value);
    const price = parseFloat(document.getElementById('prod-price').value);
    const category = document.getElementById('prod-category').value;

    try {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = 'Guardando...';
        
        if (id) {
            await updateProduct(id, { name, cost, price, category });
            window.showToast('Producto actualizado', 'success');
        } else {
            await createProduct({ name, cost, price, category, stock: 0 });
            window.showToast('Producto añadido', 'success');
        }
        
        window.closeModal();
        e.target.reset();
        document.getElementById('prod-id').value = '';
        document.querySelector('#modal-product h3').textContent = 'Añadir Producto';
        document.querySelector('#form-product button[type="submit"]').textContent = 'Guardar Producto';
        
        await loadProducts();
    } catch (error) {
        window.showToast('Error al guardar el producto', 'error');
        console.error(error);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = id ? 'Actualizar Catálogo' : 'Guardar Producto';
    }
}

// 4.5 Lógica de Stock Aislada
window.openStockModal = (id) => {
    const product = state.products.find(p => p.id === id);
    if (!product) return;
    
    document.getElementById('stock-prod-id').value = product.id;
    document.getElementById('label-stock-prod').textContent = product.name;
    document.getElementById('stock-qty').value = '';
    
    window.openModal('modal-stock');
};

async function handleAddStock(e) {
    e.preventDefault();
    const btnSubmit = e.target.querySelector('button[type="submit"]');    
    const id = document.getElementById('stock-prod-id').value;
    const qty = parseInt(document.getElementById('stock-qty').value);

    if (qty <= 0) return window.showToast('Ingrese una cantidad válida', 'error');

    const product = state.products.find(p => p.id === id);
    if (!product) return;

    try {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = 'Sumando...';
        
        await updateProduct(id, { stock: product.stock + qty });
        window.closeModal();
        window.showToast(`Stock actualizado exitosamente (+${qty})`, 'success');
        
        await loadProducts();
    } catch (error) {
        window.showToast('Error al sumar stock', 'error');
        console.error(error);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = 'Sumar';
    }
}

// Lógica de Proveedores
async function loadSuppliers() {
    try {
        state.suppliers = await getSuppliers();
        renderSuppliersTable();
        renderSupplierSelect();
    } catch (error) {
        showToast('Error cargando proveedores', 'error');
        console.error(error);
    }
}

function renderSuppliersTable() {
    const tableBody = document.getElementById('suppliers-table-body');
    const cardsBody = document.getElementById('suppliers-cards-body');
    if (!tableBody) return;
    if (state.suppliers.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-stone-400">Pronto registramos proveedores...</td></tr>`;
        if (cardsBody) cardsBody.innerHTML = `<div class="p-8 text-center text-stone-400 bg-white rounded-3xl border border-stone-100 shadow-sm">Sin proveedores registrados.</div>`;
        return;
    }
    tableBody.innerHTML = state.suppliers.map(s => `
        <tr class="table-row-anim border-b border-stone-50">
            <td class="p-5 font-medium">${s.name}</td>
            <td class="p-5 text-sm">${s.phone || '-'}</td>
            <td class="p-5 text-sm text-stone-500">${s.email || '-'}</td>
            <td class="p-5 text-sm tracking-wider">${s.document || '-'}</td>
        </tr>
    `).join('');

    if (cardsBody) {
        cardsBody.innerHTML = state.suppliers.map(s => `
            <div class="bg-white p-5 rounded-3xl shadow-sm border border-stone-100">
                <h3 class="font-bold text-stone-900 text-lg mb-1">${s.name}</h3>
                <div class="mt-3 space-y-2 text-sm">
                    ${s.phone ? `<div class="flex items-center gap-2 text-stone-600"><span class="text-stone-400 font-medium w-16 shrink-0">Tel.</span> ${s.phone}</div>` : ''}
                    ${s.email ? `<div class="flex items-center gap-2 text-stone-600"><span class="text-stone-400 font-medium w-16 shrink-0">Email</span> <span class="truncate">${s.email}</span></div>` : ''}
                    ${s.document ? `<div class="flex items-center gap-2 text-stone-600"><span class="text-stone-400 font-medium w-16 shrink-0">CUIT</span> ${s.document}</div>` : ''}
                </div>
            </div>
        `).join('');
    }
}

function renderSupplierSelect() {
    const select = document.getElementById('exp-supplier_id');
    if (!select) return;
    select.innerHTML = '<option value="">(Sin proveedor / Gasto genérico)</option>' + 
        state.suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

async function handleCreateSupplier(e) {
    e.preventDefault();
    const btnSubmit = e.target.querySelector('button[type="submit"]');    
    const name = document.getElementById('sup-name').value;
    const phone = document.getElementById('sup-phone').value;
    const email = document.getElementById('sup-email').value;
    const documentData = document.getElementById('sup-document').value;

    try {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = 'Guardando...';
        await createSupplier({ name, phone, email, document: documentData });
        window.closeModal();
        window.showToast('Proveedor añadido', 'success');
        e.target.reset();
        await loadSuppliers();
    } catch (error) {
        window.showToast('Error al registrar el proveedor', 'error');
        console.error(error);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = 'Guardar Dato';
    }
}



// Lógica de Categorías
async function loadCategories() {
    try {
        state.categories = await getCategories();
        renderCategorySelect();
        renderCategoriesTable();
    } catch (error) {
        console.error(error);
    }
}

function renderCategorySelect() {
    const select = document.getElementById('prod-category');
    if (!select) return;
    
    const currentValue = select.value;
    select.innerHTML = '<option value="">Sin Categoría</option>' + 
        state.categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    
    if (state.categories.some(c => c.name === currentValue)) {
        select.value = currentValue;
    }
}

function renderCategoriesTable() {
    const tableBody = document.getElementById('categories-table-body');
    const cardsBody = document.getElementById('categories-cards-body');
    if (!tableBody) return;
    if (state.categories.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="2" class="p-8 text-center text-stone-400">Aún no registraste categorías...</td></tr>`;
        if (cardsBody) cardsBody.innerHTML = `<div class="p-8 text-center text-stone-400 bg-white rounded-3xl border border-stone-100 shadow-sm">Sin categorías registradas.</div>`;
        return;
    }
    tableBody.innerHTML = state.categories.map(c => `
        <tr class="table-row-anim border-b border-stone-50">
            <td class="p-5 font-medium">${c.name}</td>
            <td class="p-5 text-right w-24">
                <div class="flex items-center justify-end gap-2">
                    <button onclick="window.editCategory('${c.id}')" class="p-1.5 bg-indigo-50 text-indigo-500 rounded-lg hover:bg-indigo-100 transition-colors" title="Editar">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    </button>
                    <button onclick="window.deleteCategory('${c.id}')" class="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors" title="Eliminar">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    if (cardsBody) {
        cardsBody.innerHTML = state.categories.map(c => `
            <div class="bg-white p-4 rounded-2xl shadow-sm border border-stone-100 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center">
                        <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                    </div>
                    <span class="font-semibold text-stone-800">${c.name}</span>
                </div>
                <div class="flex gap-2">
                    <button onclick="window.editCategory('${c.id}')" class="p-2 bg-indigo-50 text-indigo-500 rounded-xl hover:bg-indigo-100 transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    </button>
                    <button onclick="window.deleteCategory('${c.id}')" class="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </div>
        `).join('');
    }
}

window.openCategoryModal = () => {
    document.getElementById('cat-id').value = '';
    document.getElementById('cat-name').value = '';
    document.getElementById('cat-modal-title').textContent = 'Añadir Categoría';
    
    // Si estabamos en modal producto, solo lo cerramos y abrimos
    window.openModal('modal-category');
};

window.editCategory = (id) => {
    const category = state.categories.find(c => c.id === id);
    if (!category) return;
    
    document.getElementById('cat-id').value = category.id;
    document.getElementById('cat-name').value = category.name;
    document.getElementById('cat-modal-title').textContent = 'Editar Categoría';
    
    window.openModal('modal-category');
};

window.deleteCategory = async (id) => {
    window.showConfirm(
        'Eliminar Categoría',
        '¿Estás seguro de querer borrarla? Los productos asignados conservarán el texto históricamente.',
        async () => {
            try {
                await deleteCategory(id);
                window.showToast('Categoría eliminada', 'success');
                await loadCategories();
            } catch (error) {
                window.showToast('Error al eliminar categoría', 'error');
                console.error(error);
            }
        }
    );
};

async function handleCreateCategory(e) {
    e.preventDefault();
    const btnSubmit = e.target.querySelector('button[type="submit"]');    
    const id = document.getElementById('cat-id').value;
    const name = document.getElementById('cat-name').value;

    try {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = 'Guardando...';
        
        if (id) {
            await updateCategory(id, name);
            window.showToast('Categoría actualizada', 'success');
        } else {
            await createCategory(name);
            window.showToast('Categoría añadida', 'success');
        }
        
        window.closeModal();
        e.target.reset();
        await loadCategories();
    } catch (error) {
        window.showToast('Error al procesar categoría (Revisa si ya existe)', 'error');
        console.error(error);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = 'Guardar';
    }
}

// Lógica de Gastos
window.deleteExpense = async (id) => {
    window.showConfirm(
        'Eliminar Gasto',
        '¿Estás seguro de que deseas eliminar este gasto de tu caja?',
        async () => {
            try {
                await deleteExpense(id);
                window.showToast('Gasto eliminado', 'success');
                await loadExpenses();
            } catch (error) {
                window.showToast('Error al eliminar gasto', 'error');
                console.error(error);
            }
        }
    );
};

async function loadExpenses() {
    try {
        state.expenses = await getExpenses();
        renderExpensesTable();
    } catch (error) {
        showToast('Error cargando gastos', 'error');
        console.error(error);
    }
}

function renderExpensesTable() {
    const tableBody = document.getElementById('expenses-table-body');
    const cardsBody = document.getElementById('expenses-cards-body');
    if (!tableBody) return;
    
    if (state.expenses.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-stone-400">Aún no registraste gastos...</td></tr>`;
        if (cardsBody) cardsBody.innerHTML = `<div class="p-8 text-center text-stone-400 bg-white rounded-3xl border border-stone-100 shadow-sm">Sin gastos registrados.</div>`;
        return;
    }

    const paymentIcon = { efectivo: '💵', tarjeta: '💳', transferencia: '🏦' };

    tableBody.innerHTML = state.expenses.map(e => `
        <tr class="table-row-anim border-b border-stone-50">
            <td class="p-5 text-sm">${new Date(e.created_at).toLocaleDateString()}</td>
            <td class="p-5 font-medium">${e.description}</td>
            <td class="p-5 capitalize">${e.category}</td>
            <td class="p-5 text-center capitalize">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-800">
                    ${e.payment_method}
                </span>
            </td>
            <td class="p-5 text-right font-bold text-amber-600">$${e.amount}</td>
            <td class="p-5 text-right w-10">
                <button onclick="window.deleteExpense('${e.id}')" class="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors" title="Eliminar Gasto">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </td>
        </tr>
    `).join('');

    if (cardsBody) {
        cardsBody.innerHTML = state.expenses.map(e => `
            <div class="bg-white p-5 rounded-3xl shadow-sm border border-stone-100">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex-1 pr-4">
                        <p class="font-bold text-stone-900 leading-tight">${e.description}</p>
                        <p class="text-xs text-stone-400 mt-1">${new Date(e.created_at).toLocaleDateString('es-AR')} &bull; <span class="capitalize">${e.category}</span></p>
                    </div>
                    <p class="text-xl font-black text-amber-600 shrink-0">$${e.amount}</p>
                </div>
                <div class="flex items-center justify-between pt-3 border-t border-stone-50">
                    <span class="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 bg-stone-100 px-3 py-1.5 rounded-full">
                        ${paymentIcon[e.payment_method] || ''} ${e.payment_method}
                    </span>
                    <button onclick="window.deleteExpense('${e.id}')" class="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </div>
        `).join('');
    }
}

async function handleCreateExpense(e) {
    e.preventDefault();
    const btnSubmit = e.target.querySelector('button[type="submit"]');    
    const description = document.getElementById('exp-desc').value;
    const amount = parseFloat(document.getElementById('exp-amount').value);
    const category = document.getElementById('exp-cat').value;
    const payment_method = document.getElementById('exp-payment').value;
    const supplier_id = document.getElementById('exp-supplier_id').value;

    try {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = 'Guardando...';
        await createExpense({ description, amount, category, payment_method, supplier_id });
        window.closeModal();
        window.showToast('Gasto registrado exitosamente', 'success');
        e.target.reset();
        await loadExpenses();
    } catch (error) {
        window.showToast('Error al registrar el gasto', 'error');
        console.error(error);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = 'Guardar Gasto';
    }
}

// 5. Lógica de Ventas
function renderProductSelect() {
    ui.saleProductSelect.innerHTML = '<option value="">Selecciona un producto...</option>' + 
        state.products
            .map(p => `<option value="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>${p.name} - $${p.price} (Stock: ${p.stock})</option>`)
            .join('');
}

function addToCart() {
    const prodId = ui.saleProductSelect.value;
    const qty = parseInt(document.getElementById('sale-qty').value);
    
    if (!prodId) return showToast('Selecciona un producto', 'error');
    
    const product = state.products.find(p => p.id === prodId);
    if (!product || qty <= 0) return;
    if (qty > product.stock) return showToast('Stock insuficiente', 'error');

    const existingItem = state.cart.find(i => i.product_id === prodId);
    if (existingItem) {
        if (existingItem.quantity + qty > product.stock) return showToast('Supera el stock', 'error');
        existingItem.quantity += qty;
    } else {
        state.cart.push({
            product_id: product.id,
            name: product.name,
            quantity: qty,
            unit_price: product.price
        });
    }
    renderCart();
}

function renderCart() {
    const cartBody = document.getElementById('cart-body');
    const cartCards = document.getElementById('cart-cards-body');

    if (state.cart.length === 0) {
        if (cartBody) cartBody.innerHTML = `<tr><td colspan="5" class="p-10 text-center text-stone-400">El carrito está vacío</td></tr>`;
        if (cartCards) cartCards.innerHTML = `<div class="p-8 text-center text-stone-400 bg-white rounded-3xl border border-stone-100 shadow-sm">El carrito está vacío</div>`;
        document.getElementById('sale-total').textContent = '$0.00';
        return;
    }

    const total = state.cart.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

    // Tabla desktop
    if (cartBody) {
        cartBody.innerHTML = state.cart.map((item, index) => `
            <tr class="table-row-anim border-b border-stone-50">
                <td class="p-4 font-medium">${item.name}</td>
                <td class="p-4 text-center">${item.quantity}</td>
                <td class="p-4 text-right text-stone-500">$${item.unit_price}</td>
                <td class="p-4 text-right font-bold">$${(item.quantity * item.unit_price).toFixed(2)}</td>
                <td class="p-4 text-right">
                    <button onclick="window.removeFromCart(${index})" class="p-1.5 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // Tarjetas móvil
    if (cartCards) {
        cartCards.innerHTML = state.cart.map((item, index) => `
            <div class="bg-white p-4 rounded-2xl shadow-sm border border-stone-100 flex items-center gap-3">
                <div class="flex-1">
                    <p class="font-bold text-stone-900">${item.name}</p>
                    <p class="text-sm text-stone-500 mt-0.5">${item.quantity} u. &times; $${item.unit_price}</p>
                </div>
                <p class="font-black text-stone-900 text-lg">$${(item.quantity * item.unit_price).toFixed(2)}</p>
                <button onclick="window.removeFromCart(${index})" class="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors shrink-0">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>
        `).join('');
    }

    document.getElementById('sale-total').textContent = `$${total.toFixed(2)}`;
}

window.removeFromCart = (index) => {
    state.cart.splice(index, 1);
    renderCart();
};

async function handleCheckout() {
    if (state.cart.length === 0) return showToast('El carrito está vacío', 'error');
    const method = document.getElementById('sale-payment-method').value;
    
    const payload = state.cart.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price
    }));

    ui.btnConfirmSale.disabled = true;
    ui.btnConfirmSale.textContent = 'Procesando...';

    try {
        await processSale(method, payload);
        showToast('Venta registrada con éxito', 'success');
        state.cart = [];
        renderCart();
        await loadProducts(); // Recargar stock
    } catch (error) {
        console.error(error);
        showToast('Error al registrar la venta', 'error');
    } finally {
        ui.btnConfirmSale.disabled = false;
        ui.btnConfirmSale.textContent = 'Confirmar Venta';
    }
}

// 6. Reportes e Historial de Ventas
window.filterSales = async (filter) => {
    state.currentSalesFilter = filter;
    
    // UI Botones
    const btns = ['today', 'week', 'month', 'all'];
    btns.forEach(b => {
        const btn = document.getElementById(`btn-filter-${b}`);
        if (!btn) return;
        if (b === filter) {
            btn.className = 'px-3 py-2 font-medium text-sm rounded-lg transition-all bg-white text-stone-900 shadow-sm';
        } else {
            btn.className = 'px-3 py-2 font-medium text-sm rounded-lg transition-all text-stone-500 hover:text-stone-900';
        }
    });

    await loadSalesHistory(filter);
};

async function loadSalesHistory(filter) {
    const tableBody = document.getElementById('sales-history-tbody');
    if (!tableBody) return;
    
    tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-stone-400">Cargando reportes...</td></tr>`;
    
    try {
        state.salesHistory = await getSalesHistory(filter);
        renderSalesHistory();
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-400">Error cargando historial</td></tr>`;
        console.error(error);
    }
}

function renderSalesHistory() {
    const tableBody = document.getElementById('sales-history-tbody');
    const cardsBody = document.getElementById('sales-history-cards');
    if (!tableBody) return;
    
    if (state.salesHistory.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-stone-400">No hay ventas registradas en este período.</td></tr>`;
        if (cardsBody) cardsBody.innerHTML = `<div class="p-8 text-center text-stone-400 bg-white rounded-3xl border border-stone-100 shadow-sm">No hay ventas en este período.</div>`;
        return;
    }

    const paymentIcon = { efectivo: '💵', tarjeta: '💳', transferencia: '🏦' };

    tableBody.innerHTML = state.salesHistory.map(s => {
        const details = s.sale_items.map(item => `<span class="inline-block px-2 py-0.5 bg-stone-100 rounded text-xs mr-1 mb-1">${item.quantity}x ${item.products ? item.products.name : 'Desc'} ($${item.unit_price || 0})</span>`).join('');
        return `
        <tr class="table-row-anim border-b border-stone-50">
            <td class="p-5 text-sm">${new Date(s.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td class="p-5 w-full max-w-[200px] whitespace-normal leading-tight">${details}</td>
            <td class="p-5 text-center capitalize">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-800">
                    ${s.payment_method}
                </span>
            </td>
            <td class="p-5 text-right font-bold text-stone-800">$${s.total_amount}</td>
            <td class="p-5 w-20 text-right">
                <div class="flex justify-end">
                    <button onclick="window.deleteSale('${s.id}')" class="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors" title="Eliminar y devolver Stock">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            </td>
        </tr>
    `}).join('');

    // Tarjetas móvil
    if (cardsBody) {
        cardsBody.innerHTML = state.salesHistory.map(s => {
            const itemsList = s.sale_items.map(item =>
                `<span class="inline-block px-2 py-0.5 bg-stone-100 rounded-full text-xs mr-1 mb-1">${item.quantity}x ${item.products ? item.products.name : 'Desc'}</span>`
            ).join('');
            return `
            <div class="bg-white p-5 rounded-3xl shadow-sm border border-stone-100">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <p class="text-xs text-stone-400 font-medium">${new Date(s.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</p>
                        <p class="font-black text-stone-900 text-2xl tracking-tighter mt-1">$${s.total_amount}</p>
                    </div>
                    <button onclick="window.deleteSale('${s.id}')" class="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors mt-1" title="Anular venta">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
                <div class="mb-3 leading-relaxed">${itemsList}</div>
                <div class="pt-3 border-t border-stone-50">
                    <span class="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 bg-stone-100 px-3 py-1.5 rounded-full">
                        ${paymentIcon[s.payment_method] || ''} ${s.payment_method}
                    </span>
                </div>
            </div>`;
        }).join('');
    }
}


window.deleteSale = async (id) => {
    window.showConfirm(
        'Anular Venta Completa',
        'Al proceder, la venta desaparecerá de la contabilidad y todo el stock involucrado será DEPOSITADO nuevamente en tu inventario físico. ¿Anular?',
        async () => {
            try {
                await revertSale(id);
                window.showToast('Venta anulada. Stock devuelto.', 'success');
                await loadSalesHistory(state.currentSalesFilter);
                await loadProducts(); // Para actualizar stock en UI
            } catch (error) {
                window.showToast('Error al anular la venta', 'error');
                console.error(error);
            }
        }
    );
};

// Helper: contador animado
function animateCounter(element, targetValue, prefix = '$', duration = 900) {
    if (!element) return;
    element.classList.remove('counter-pop');
    void element.offsetWidth;
    element.classList.add('counter-pop');
    
    const start = performance.now();
    const startVal = 0;
    function update(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = startVal + (targetValue - startVal) * eased;
        element.textContent = prefix + value.toFixed(2);
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

// 7. Lógica de Dashboard
async function loadDashboard() {
    try {
        const stats = await getDashboardStats();
        
        const safeCurrency = (val) => Number(val) || 0;
        
        const salesEl = document.getElementById('dash-sales');
        const cogsEl = document.getElementById('dash-cogs');
        const expEl = document.getElementById('dash-expenses');
        const netEl = document.getElementById('dash-net-profit');
        
        animateCounter(salesEl, safeCurrency(stats.totalSales), '$');
        if (cogsEl) animateCounter(cogsEl, safeCurrency(stats.totalCogs), '-$');
        if (expEl) animateCounter(expEl, safeCurrency(stats.totalExpenses), '-$');
        if (netEl) animateCounter(netEl, safeCurrency(stats.netProfit), '$');
        
        // Advanced stats
        const { topSelling } = await getAdvancedStats();
        
        const topSalesList = document.getElementById('dash-top-sales');
        if (topSalesList) {
            topSalesList.innerHTML = topSelling.length > 0 ? 
                topSelling.map((t, i) => `
                    <li class="p-4 flex justify-between items-center gap-4">
                        <div class="flex items-center gap-3">
                            <span class="w-5 h-5 rounded-full bg-amber-50 text-amber-600 text-[10px] font-bold flex items-center justify-center">${i+1}</span>
                            <span class="font-medium text-stone-800">${t.name}</span>
                        </div>
                        <span class="font-bold text-stone-600 text-sm">${t.qty} u.</span>
                    </li>`).join('') :
                '<li class="p-6 text-center text-stone-400">Sin datos de ventas...</li>';
        }

        const lowStockList = document.getElementById('dash-low-stock');
        if (lowStockList) {
            const lowStock = [...state.products].sort((a, b) => a.stock - b.stock).slice(0, 5);
            lowStockList.innerHTML = lowStock.length > 0 ?
                lowStock.map(p => {
                    const isCrit = p.stock < 5;
                    return `<li class="p-4 flex justify-between items-center">
                        <span class="font-medium text-stone-700">${p.name}</span>
                        <span class="${ isCrit ? 'badge-stock-critical text-red-600 font-bold' : 'text-amber-600 font-bold' } text-sm">${p.stock} u.</span>
                    </li>`;
                }).join('') :
                '<li class="p-6 text-center text-stone-400">Excelente stock...</li>';
        }

        const highStockList = document.getElementById('dash-high-stock');
        if (highStockList) {
            const highStock = [...state.products].sort((a, b) => b.stock - a.stock).slice(0, 5);
            highStockList.innerHTML = highStock.length > 0 ?
                highStock.map(p => `
                    <li class="p-4 flex justify-between items-center">
                        <span class="font-medium text-stone-700">${p.name}</span>
                        <span class="font-bold text-indigo-500 text-sm">${p.stock} u.</span>
                    </li>`).join('') :
                '<li class="p-6 text-center text-stone-400">No hay stock...</li>';
        }

    } catch (error) {
        console.error(error);
        if (window.showToast) window.showToast('Error cargando métricas', 'error');
    }
}

// Arrancar App
init();