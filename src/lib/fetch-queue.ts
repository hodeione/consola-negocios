/**
 * Serializa las llamadas fetch al propio origen: nunca hay dos peticiones
 * autenticadas en vuelo a la vez desde esta pestaña.
 *
 * Motivo: con next-auth v5 (beta) + sesión JWT, cada respuesta rota la
 * cookie de sesión (nuevo cifrado JWE). Si dos peticiones del propio cliente
 * van en paralelo (p.ej. el sondeo de una tarea y un clic en "Cancelar"),
 * pueden pisarse esa rotación y la sesión se invalida a mitad de uso. Con
 * cola, cada petición espera a que termine la anterior — coste mínimo (nuestras
 * llamadas ya son cortas) y elimina la clase de carrera por completo.
 */
let chain: Promise<unknown> = Promise.resolve();

export function queuedFetch(input: string, init?: RequestInit): Promise<Response> {
  const run = chain.then(() => fetch(input, init));
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
