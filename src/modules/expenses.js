import { supabase } from '../config/supabase.js';

export async function getExpenses() {
    const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
}

export async function createExpense(expenseData) {
    // expenseData expected: { description, amount, category, payment_method, supplier_id }
    // Clean supplier_id if empty string
    if (expenseData.supplier_id === '') {
        delete expenseData.supplier_id;
    }

    const { data, error } = await supabase
        .from('expenses')
        .insert([expenseData]);
        
    if (error) throw error;
    return data;
}

export async function deleteExpense(id) {
    const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);
        
    if (error) throw error;
    return true;
}
