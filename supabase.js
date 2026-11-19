// Lumina - cliente Supabase
// A chave publishable/anon é própria para uso no navegador.
// A segurança dos dados deve ser garantida pelas políticas RLS do banco.
(function () {
  const SUPABASE_URL = "https://mthhgxkztdpyfhapwlii.supabase.co";
  const SUPABASE_KEY = "sb_publishable_xgDWdYVmej-DniXSE0RrIg_OMDPs8PP";

  try {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("A biblioteca do Supabase não foi carregada.");
    }

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    if (!client.auth || typeof client.auth.signInWithPassword !== "function") {
      throw new Error("O módulo de autenticação do Supabase não está disponível.");
    }

    window.luminaDb = client;
    window.luminaSupabaseError = "";
    console.info("[Lumina] Conexão Supabase inicializada.");
  } catch (error) {
    window.luminaDb = null;
    window.luminaSupabaseError = error.message || "Erro ao inicializar o Supabase.";
    console.error("[Lumina]", error);
  }
})();
