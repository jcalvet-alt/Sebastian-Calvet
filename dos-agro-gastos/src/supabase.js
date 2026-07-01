import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://twqqtwqmkjsbotcznbht.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3cXF0d3Fta2pzYm90Y3puYmh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NzU4NjAsImV4cCI6MjA5ODQ1MTg2MH0.-JIjP7S1WAUZYEGu5lFRnvL4Fb2rSa2HslDSAfR09z8'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
