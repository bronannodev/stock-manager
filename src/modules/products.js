import { supabase } from '../config/supabase.js';

export async function getProducts() {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });
    
    if (error) throw error;
    return data;
}

export async function createProduct(productData) {
    const { data, error } = await supabase
        .from('products')
        .insert([productData]);
        
    if (error) throw error;
    return data;
}

export async function updateProduct(id, productData) {
    const { data, error } = await supabase
        .from('products')
        .update(productData)
        .eq('id', id);
        
    if (error) throw error;
    return data;
}

export async function deleteProduct(id) {
    const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);
        
    if (error) throw error;
    return true;
}