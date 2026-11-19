
const SUPABASE_URL = https://mthhgxkztdpyfhapwlii.supabase.co;
const SUPABASE_KEY = sb_publishable_xgDWdYVmej-DniXSE0RrIg_OMDPs8PP;

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

async function testarConexao() {
  const { data, error } = await db
    .from('clients')
    .select('*');

  if (error) {
    console.error('Erro:', error.message);
    return;
  }

  console.log('Conexão funcionando!', data);
}

testarConexao();
