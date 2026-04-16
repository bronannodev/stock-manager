import { supabase } from '../config/supabase.js';

export async function getResellers() {
    // Obtenemos los revendedores y sumamos sus stocks (si aplica),
    // de lo contrario solo la lista.
    const { data, error } = await supabase
        .from('resellers')
        .select(`
            id, name, phone, created_at,
            reseller_stock(quantity)
        `)
        .order('name', { ascending: true });

    if (error) throw error;
    
    // Transformar para contar total stock asignado
    return data.map(r => ({
        ...r,
        total_items: r.reseller_stock ? r.reseller_stock.reduce((sum, s) => sum + s.quantity, 0) : 0
    }));
}

export async function createReseller(name, phone) {
    const { data, error } = await supabase
        .from('resellers')
        .insert([{ name, phone }])
        .select();
        
    if (error) throw error;
    return data[0];
}

export async function getResellerStock(resellerId) {
    const { data, error } = await supabase
        .from('reseller_stock')
        .select(`
            product_id, quantity,
            products (name, price, cost)
        `)
        .eq('reseller_id', resellerId)
        .gt('quantity', 0); // Solo los que realmente tiene stock

    if (error) throw error;
    return data;
}

export async function assignStock(resellerId, productId, qtyToAdd) {
    // Tenemos que restar al stock original, y sumar al reseller_stock.
    // Aunque deberíamos hacer una transacción, este es un acercamiento front-to-back:
    
    // 1. Obtener producto original
    const { data: product, error: pErr } = await supabase
        .from('products')
        .select('stock')
        .eq('id', productId)
        .single();
        
    if (pErr) throw pErr;
    if (!product || product.stock < qtyToAdd) {
        throw new Error('Stock insuficiente en tienda.');
    }

    // 2. Restar en tienda
    await supabase.from('products').update({ stock: product.stock - qtyToAdd }).eq('id', productId);

    // 3. Chequear si el reseller ya tiene este producto
    const { data: rs, error: rsErr } = await supabase
        .from('reseller_stock')
        .select('id, quantity')
        .eq('reseller_id', resellerId)
        .eq('product_id', productId)
        .maybeSingle();

    if (rs) {
        // Update (Sumar)
        await supabase
            .from('reseller_stock')
            .update({ quantity: rs.quantity + qtyToAdd })
            .eq('id', rs.id);
    } else {
        // Insert
        await supabase
            .from('reseller_stock')
            .insert([{ reseller_id: resellerId, product_id: productId, quantity: qtyToAdd }]);
    }
    
    return true;
}

export async function settleStock(resellerId, settlementItems) {
    // settlementItems = [{ product_id, sold: int, returned: int, original_price: numeric }]
    // Vendidos se deben generar como una venta global para el Reseller
    
    const soldItemsToRegister = [];
    
    for (const item of settlementItems) {
        // 1. Descartar del inventario del vendedor (Sold + Returned)
        const totalToDeduct = item.sold + item.returned;
        
        if (totalToDeduct > 0) {
            const { data: rs } = await supabase
                .from('reseller_stock')
                .select('id, quantity')
                .eq('reseller_id', resellerId)
                .eq('product_id', item.product_id)
                .single();
                
            if (rs) {
                const newQty = Math.max(0, rs.quantity - totalToDeduct);
                await supabase.from('reseller_stock').update({ quantity: newQty }).eq('id', rs.id);
            }
        }
        
        // 2. Devolver a Tienda (Returned)
        if (item.returned > 0) {
            const { data: p } = await supabase.from('products').select('stock').eq('id', item.product_id).single();
            if (p) {
                await supabase.from('products').update({ stock: p.stock + item.returned }).eq('id', item.product_id);
            }
        }
        
        // 3. Preparar items vendidos para el recibo
        if (item.sold > 0) {
            soldItemsToRegister.push({
                product_id: item.product_id,
                quantity: item.sold,
                unit_price: item.original_price
            });
        }
    }
    
    // Si hubo ventas, registrarlas usando la función register_sale RPC, 
    // pero NOTEMOS que register_sale DESCUENTA stock de "products". 
    // Como la mercadería ya estaba fuera de "products" (en reseller_stock),
    // si usamos register_sale, nos descontaría doble (al salir y al rendir).
    // ARREGLO: Después de register_sale, volvemos a SUMAR al inventario lo vendido porque register_sale lo restará.
    // Esto es un parche porque `register_sale` no acepta (todavía) una flag de `no_discount`.
    
    if (soldItemsToRegister.length > 0) {
        // Buscamos nombre reseller
        const { data: resData } = await supabase.from('resellers').select('name').eq('id', resellerId).single();
        const clientName = resData ? `Revendedor: ${resData.name}` : 'Revendedor';
        
        // Llamamos al RPC (restará stock de nuevo)
        const { error } = await supabase.rpc('register_sale', {
            p_payment_method: 'efectivo', // Podemos forzar o dejar parametrizado (lo dejamos efectivo por ahora y luego se puede enviar al backend)
            p_items: soldItemsToRegister,
            p_status: 'paid',
            p_client_name: clientName
        });
        
        if (error) throw error;
        
        // Devolvemos el stock a tienda que `register_sale` nos descontó injustamente
        for (const sItem of soldItemsToRegister) {
            const { data: p } = await supabase.from('products').select('stock').eq('id', sItem.product_id).single();
            if (p) {
                await supabase.from('products').update({ stock: p.stock + sItem.quantity }).eq('id', sItem.product_id);
            }
        }
    }
    
    
    return true;
}

export async function deleteReseller(id) {
    const { error } = await supabase
        .from('resellers')
        .delete()
        .eq('id', id);
        
    if (error) throw error;
    return true;
}
