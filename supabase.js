// Lumina - inicialização do cliente Supabase.
// A chave publishable pode ficar no frontend; proteja os dados com RLS no Supabase.
(function () {
  const SUPABASE_URL = "https://mthhgxkztdpyfhapwlii.supabase.co";
  const SUPABASE_KEY = "sb_publishable_xgDWdYVmej-DniXSE0RrIg_OMDPs8PP";

  try {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("Biblioteca do Supabase não carregada (createClient indisponível).");
    }

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    if (!client || !client.auth || typeof client.auth.getSession !== "function") {
      throw new Error("O cliente foi criado, mas o módulo auth não está disponível. Recarregue a biblioteca Supabase.");
    }

    window.luminaDb = client;
    window.luminaSupabaseError = "";
    console.info("[Lumina] Supabase inicializado com autenticação.");
  } catch (error) {
    window.luminaDb = null;
    window.luminaSupabaseError = error.message || "Falha ao inicializar o Supabase.";
    console.error("[Lumina]", window.luminaSupabaseError, error);
  }
})();
