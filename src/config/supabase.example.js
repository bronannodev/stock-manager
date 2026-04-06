import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// RENOMBRA ESTE ARCHIVO A supabase.js Y COMPLETA CON TUS CREDENCIALES
// No compartas ni subas supabase.js al repositorio. Ese archivo ya está en .gitignore.

const SUPABASE_URL = 'https://TU_PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'TU_ANON_KEY_AQUI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
