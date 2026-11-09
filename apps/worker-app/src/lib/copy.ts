/**
 * The worker app's words, in Spanish (ADR 0007: W-* is Spanish only). They
 * follow the W-* boards; where a board's line assumed something the build
 * does not have yet (store pushes, a fixed quarter of the window), it says
 * what the app does instead (`docs/worker-app-plan.md` §6).
 */
export const copy = {
  appTitle: 'Colaboradores',
  login: {
    title: 'Entrar',
    lead: 'Tu teléfono es tu llave',
    explain:
      'Te enviamos un código por SMS. No hay contraseña que recordar ni correo que revisar.',
    phoneLabel: 'Número de teléfono',
    phoneHint: 'El mismo número que diste al registrarte como colaborador.',
    send: 'Enviarme el código',
    badPhone: 'Escribe un número de 8 cifras, por ejemplo 5 241 0088.',
    privacy:
      'Solo ves el nombre, el idioma y el tamaño del grupo de los viajeros. Nunca direcciones ni pagos.',
    offline:
      'Funciona sin conexión: tus respuestas se guardan y se envían cuando vuelva la señal.',
    codeTitle: 'Escribe el código',
    sentTo: (phone: string) => `Enviado por SMS al ${phone}. Caduca en 10 minutos.`,
    codeLabel: 'Código de 6 cifras',
    confirm: 'Confirmar',
    resendIn: (time: string) => `Reenviar en ${time}`,
    resend: 'Reenviar el código',
    changeNumber: 'Cambiar número',
    noSignal: (phone: string | null) =>
      phone
        ? `¿Sin señal para el SMS? Llama a la central al ${phone} y te lo dictan tras verificar tu carnet.`
        : '¿Sin señal para el SMS? Llama a la central y te lo dictan tras verificar tu carnet.',
    invalid: 'Este código no es válido. Pide uno nuevo o llama a la central.',
    noConnection: 'Sin conexión. Inténtalo cuando vuelva la señal.',
    session:
      'Sesión de 30 días en este teléfono. Si cambias de número, avisa a la central para no perder las ofertas.',
  },
  home: {
    hello: (name: string | null) => (name ? `Hola, ${name}` : 'Hola'),
    synced: 'Sincronizado',
    offline: (pending: number) =>
      pending > 0
        ? `Sin conexión · ${pending} pendiente${pending === 1 ? '' : 's'}`
        : 'Sin conexión',
    sending: (pending: number) =>
      `${pending} respuesta${pending === 1 ? '' : 's'} por enviar`,
    credential: (until: string | null, reliability: number | null) =>
      [
        until
          ? `Credencial vigente · vence ${until}`
          : 'Credencial sin fecha de vencimiento',
        reliability === null ? null : `fiabilidad ${reliability}`,
      ]
        .filter(Boolean)
        .join(' · '),
    pendingAudit:
      'Tu alta está pendiente de revisión. Las ofertas llegan cuando la central la apruebe.',
    suspended: 'Tu cuenta está suspendida. Llama a la central.',
    offers: (count: number) =>
      count === 0
        ? 'Ofertas'
        : count === 1
          ? '1 oferta esperando'
          : `${count} ofertas esperando`,
    noOffers: 'No tienes ofertas ahora. Te avisamos por SMS cuando llegue una.',
    left: (time: string) => `quedan ${time}`,
    answerNow: 'Responder ahora',
    saved: 'Respuesta guardada · se enviará al volver la señal',
    jobs: 'Próximos trabajos',
    noJobs: 'No tienes trabajos asignados.',
    assigned: 'Asignado',
    desk: (phone: string) => `Central 24/7 · ${phone}`,
    refresh: 'Actualizar',
    signOut: 'Salir',
    refused:
      'La central ya no esperaba esta respuesta: la oferta caducó o se retiró antes de que llegara.',
    signedOut:
      'Tu sesión terminó. Entra de nuevo; tus respuestas guardadas se enviarán después.',
  },
  offer: {
    title: 'Oferta de trabajo',
    toAnswer: (time: string) => `${time} para responder`,
    offeredAt: (time: string) => `ofrecido a las ${time}`,
    hurry:
      'Queda poco tiempo. Si no respondes, la central ofrece el trabajo a otro colaborador y la oferta desaparece.',
    expired:
      'El tiempo para responder terminó. La central ya está ofreciendo este trabajo a otro colaborador.',
    service: 'Servicio',
    from: 'Empieza',
    to: 'Termina',
    travelers: 'Viajeros',
    pay: 'Pago',
    net: (amount: string) => `${amount} neto`,
    booking: 'Reserva',
    accept: 'Aceptar el trabajo',
    decline: 'Rechazar…',
    commitment:
      'Aceptar es un compromiso: una cancelación de última hora baja tu fiabilidad más que un rechazo a tiempo.',
    why: '¿Por qué no puedes?',
    tellUs: 'Cuéntanos brevemente',
    confirmDecline: 'Confirmar rechazo',
    back: 'Volver',
    fuelNote:
      'Si el motivo es el combustible, la central puede mandarte un chofer de apoyo con reserva en vez de perder el trabajo.',
    accepted: (time: string) => `Aceptado · ${time}`,
    acceptedText:
      'Ya está en tus trabajos. La central y los viajeros reciben la confirmación. La orden de trabajo (PDF) llega cuando el viaje quede confirmado y pagado.',
    declined: (reason: string) => `Rechazado · motivo: ${reason}`,
    declinedText:
      'Gracias por avisar rápido: la central ya lo está ofreciendo a otro colaborador. Los rechazos cuentan en tu fiabilidad; un motivo claro pesa menos que no responder.',
    sent: 'Enviado.',
    queued: 'Guardado en el teléfono · se enviará solo cuando vuelva la señal.',
    home: 'Volver al inicio',
  },
} as const;

/** W-Offer's decline reasons, in the board's order. */
export const DECLINE_REASONS = [
  { key: 'busy', label: 'Ya tengo otro trabajo ese día' },
  { key: 'vehicle', label: 'Problema con el vehículo' },
  { key: 'fuel', label: 'No tengo combustible asegurado' },
  { key: 'far', label: 'Demasiado lejos para mí' },
  { key: 'other', label: 'Otro motivo' },
] as const;

export type DeclineReasonKey = (typeof DECLINE_REASONS)[number]['key'];

/** The reason as the desk reads it: the label, or "Otro motivo: …" with the worker's words. */
export function declineReasonText(key: DeclineReasonKey, note: string): string {
  const reason = DECLINE_REASONS.find((candidate) => candidate.key === key)!;
  const typed = note.trim();
  return key === 'other' && typed ? `${reason.label}: ${typed}` : reason.label;
}
