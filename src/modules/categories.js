import { supabase } from '../config/supabase.js';

export async function getCategories() {
    const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true });
    
    if (error) throw error;
    return data;
}

export async function createCategory(name) {
    const { data, error } = await supabase
        .from('categories')
        .insert([{ name }]);
        
    if (error) throw error;
    return data;
}

export async function updateCategory(id, name) {
    const { data, error } = await supabase
        .from('categories')
        .update({ name })
        .eq('id', id);
        
    if (error) throw error;
    return data;
}

export async function deleteCategory(id) {
    const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);
        
    if (error) throw error;
    return true;
}
