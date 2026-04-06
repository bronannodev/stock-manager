import { supabase } from '../config/supabase.js';

export async function getSuppliers() {
    const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name', { ascending: true });
    
    if (error) throw error;
    return data;
}

export async function createSupplier(supplierData) {
    const { data, error } = await supabase
        .from('suppliers')
        .insert([supplierData]);
        
    if (error) throw error;
    return data;
}
