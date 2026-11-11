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
  calendar: {
    title: 'Calendario',
    open: 'Calendario y disponibilidad',
    previous: 'Mes anterior',
    next: 'Mes siguiente',
    weekdays: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
    legend: {
      AVAILABLE: 'Disponible',
      BLOCKED: 'Bloqueado',
      JOB: 'Trabajo',
      OFFER: 'Oferta pendiente',
    },
    state: {
      AVAILABLE: 'Disponible',
      BLOCKED: 'Bloqueado',
      JOB: 'Trabajo asignado',
      OFFER: 'Oferta pendiente',
    },
    stateAria: {
      AVAILABLE: 'disponible',
      BLOCKED: 'bloqueado',
      JOB: 'trabajo asignado',
      OFFER: 'oferta pendiente',
    },
    hint: 'Toca un día para bloquearlo o liberarlo. Los días con trabajo asignado no se pueden bloquear desde aquí: llama a la central.',
    today: 'hoy',
    free: 'Recibes ofertas para este día. Si no vas a estar, bloquéalo: así la central no cuenta contigo.',
    blocked: 'No recibirás ofertas para este día.',
    past: 'Este día ya pasó.',
    beyond: 'Todavía no puedes cambiar un día tan lejano.',
    block: 'Bloquear este día',
    unblock: 'Volver a estar disponible',
    callDesk: 'Llamar a la central para cambiarlo',
    offer: (label: string) => `Oferta: ${label}`,
    answerBy: (time: string) => `Responde antes de las ${time}`,
    range: 'Bloquear varios días',
    from: 'Desde',
    to: 'Hasta',
    pick: 'Ahora toca el día en el calendario.',
    blockDays: (count: number) =>
      count === 0
        ? 'Bloquear días'
        : count === 1
          ? 'Bloquear 1 día'
          : `Bloquear ${count} días`,
    tooMany: (max: number) => `Como mucho ${max} días de una vez.`,
    longRule: (days: number) =>
      `Si bloqueas más de ${days} días seguidos, la central te marca como inactivo y te llama antes de la temporada alta.`,
    longBlock: (days: number, from: string, to: string) =>
      `Tienes ${days} días seguidos bloqueados, del ${from} al ${to}: la central te marca como inactivo y te llama antes de la temporada alta.`,
    done: (count: number, blocked: boolean) =>
      `${count === 1 ? '1 día' : `${count} días`} ${blocked ? 'bloqueado' : 'disponible'}${count === 1 ? '' : 's'}.`,
    kept: (count: number) =>
      count === 1
        ? '1 día con trabajo u oferta se queda como estaba.'
        : `${count} días con trabajo u oferta se quedan como estaban.`,
    fuel: 'Combustible en reserva',
    litres: 'litros',
    litresLabel: 'Litros en reserva',
    update: 'Actualizar',
    declared: (date: string) => `declarado el ${date}`,
    declaredToday: (time: string) => `actualizado hoy ${time}`,
    never: 'sin declarar',
    stale: 'Ya toca declararlo de nuevo.',
    fuelExplain:
      'Lo usa la central para la lista de choferes de apoyo cuando hay escasez. Declara cada semana, aunque no cambie.',
    badLitres: 'Escribe los litros en cifras, por ejemplo 40.',
    refused: 'La central no aceptó este cambio. Inténtalo de nuevo o llama a la central.',
    back: 'Volver al inicio',
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
