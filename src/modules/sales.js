import { supabase } from '../config/supabase.js';

export async function processSale(paymentMethod, cartItems, status = 'paid', clientName = null) {
    // cartItems debe ser un array de objetos: { product_id, quantity, unit_price }
    const { data, error } = await supabase.rpc('register_sale', {
        p_payment_method: paymentMethod,
        p_items: cartItems,
        p_status: status,
        p_client_name: clientName
    });

    if (error) throw error;
    return data; // Devuelve el UUID de la venta
}

export async function getDebtors() {
    const { data, error } = await supabase
        .from('sales')
        .select(`
            id, total_amount, payment_method, created_at, client_name,
            sale_items ( quantity, product_id, unit_price, products(name) )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
}

export async function payDebt(saleId, paymentMethod) {
    // Solo marca la deuda como pagada y documenta cómo pagó finalmente
    const { error } = await supabase
        .from('sales')
        .update({ 
            status: 'paid', 
            payment_method: paymentMethod 
        })
        .eq('id', saleId);
    
    if (error) throw error;
    return true;
}

export async function getDashboardStats() {

    // 1. Ingresos (Bruto)
    const { data: sales, error: salesError } = await supabase.from('sales').select('total_amount');
    if (salesError) throw salesError;
    const totalSales = sales.reduce((sum, s) => sum + Number(s.total_amount), 0);

    // 2. Gastos
    const { data: expenses, error: expError } = await supabase.from('expenses').select('amount');
    if (expError) throw expError;
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    // 3. Costo de Mercadería Vendida (COGS)
    const { data: items, error: itemsError } = await supabase
        .from('sale_items')
        .select(`quantity, products(cost)`);
    if (itemsError) throw itemsError;

    let totalCogs = 0;
    items.forEach(item => {
        if (item.products && item.products.cost) {
            totalCogs += item.quantity * Number(item.products.cost);
        }
    });

    const netProfit = totalSales - totalCogs - totalExpenses;

    return { 
        totalSales, 
        totalExpenses, 
        totalCogs,
        netProfit
    };
}

export async function getAdvancedStats() {
    // Top Ventas (Requiere hacer una suma de cantidades agrupadas por producto)
    // Para no usar RPC avanzado si no lo hay, traemos todos los sale_items.
    const { data: saleItems, error: itemsError } = await supabase
        .from('sale_items')
        .select(`quantity, product_id, products(name)`);
        
    if (itemsError) throw itemsError;

    // Agrupar y sumar
    const salesCount = {};
    if (saleItems) {
        saleItems.forEach(item => {
            if (!item.products) return; // Por si fue borrado
            const id = item.product_id;
            if (!salesCount[id]) {
                salesCount[id] = { name: item.products.name, qty: 0 };
            }
            salesCount[id].qty += item.quantity;
        });
    }

    const topSelling = Object.values(salesCount)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

    return { topSelling };
}

export async function getSalesHistory(filter = 'week') {
    let query = supabase
        .from('sales')
        .select(`
            id, total_amount, payment_method, created_at,
            sale_items ( quantity, product_id, unit_price, products(name) )
        `)
        .order('created_at', { ascending: false });

    // Lógica de Filtros de Fechas
    if (filter !== 'all') {
        const date = new Date();
        if (filter === 'week') {
            const firstDay = date.getDate() - date.getDay() + (date.getDay() === 0 ? -6 : 1); // Lunes
            const weekStart = new Date(date.setDate(firstDay));
            weekStart.setHours(0, 0, 0, 0);
            query = query.gte('created_at', weekStart.toISOString());
        } else if (filter === 'month') {
            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
            query = query.gte('created_at', monthStart.toISOString());
        } else if (filter === 'today') {
            date.setHours(0, 0, 0, 0);
            query = query.gte('created_at', date.toISOString());
        }
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function revertSale(saleId) {
    // 1. Obtener los ítems de la venta para saber qué descontar
    const { data: saleItems, error: fetchError } = await supabase
        .from('sale_items')
        .select('product_id, quantity')
        .eq('sale_id', saleId);
        
    if (fetchError) throw fetchError;

    // 2. Por cada item, restaurar stock
    for (const item of saleItems) {
        if (!item.product_id) continue;
        
        // Obtener stock actual
        const { data: prodData } = await supabase
            .from('products')
            .select('stock')
            .eq('id', item.product_id)
            .single();
            
        if (prodData) {
            // Re-sumar
            await supabase
                .from('products')
                .update({ stock: prodData.stock + item.quantity })
                .eq('id', item.product_id);
        }
    }

    // 3. Eliminar la venta (sale_items se debería borrar por CASCADE, pero lo borramos igual por seguridad)
    const { error: deleteItemsError } = await supabase.from('sale_items').delete().eq('sale_id', saleId);
    if (deleteItemsError) throw deleteItemsError;
    
    const { error: deleteSaleError } = await supabase.from('sales').delete().eq('id', saleId);
    if (deleteSaleError) throw deleteSaleError;

    return true;
}
