import type { EmergencyCategory, JobStep, ServiceType } from '@ota/domain';

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
  /** The bottom bar (W-Home's board; "Ofertas" lives on Inicio, with its count). */
  update: {
    title: (version: string) => `Nueva versión ${version}`,
    requiredTitle: 'Actualiza la app para seguir',
    requiredLead: (version: string) =>
      `La central pide la versión ${version}. Las ofertas esperan a que la instales; tus respuestas guardadas no se pierden.`,
    optionalLead: 'Hay una versión nueva de la app de colaboradores.',
    size: (size: string, date: string) => `${size} · publicada el ${date}`,
    data: 'Mejor con wifi: la descarga gasta datos.',
    afterJob: (version: string) =>
      `Hay una versión obligatoria (${version}). Te la pedimos al terminar el trabajo.`,
    later: 'Más tarde',
    install: 'Actualizar',
    // The home's card: "Actualizar" there already refreshes the home.
    open: 'Ver la nueva versión',
    downloading: (done: string, total: string) => `Descargando… ${done} de ${total}`,
    permission:
      'Android te pedirá permitir instalar apps de «Colaboradores» la primera vez, y después confirmar la actualización.',
    noData:
      'Sin conexión. La descarga necesita datos o wifi; inténtalo cuando vuelva la señal.',
    incomplete: 'La descarga llegó incompleta. Inténtalo otra vez.',
    notInstalled:
      'La actualización no se instaló. Inténtalo otra vez, o descárgala desde la página de la app.',
    retry: 'Reintentar',
    page: 'Abrir la página de descarga',
    desk: (phone: string) => `¿Problemas? Llama a la central: ${phone}`,
    back: 'Volver',
  },
  messages: {
    title: 'Mensajes con la central',
    back: 'Volver',
    open: 'Mensajes con la central',
    openUnread: (count: number) =>
      `Mensajes con la central · ${count === 1 ? '1 nuevo' : `${count} nuevos`}`,
    fromDesk: 'Mensaje de la central',
    read: 'Leer y responder',
    job: 'Mensaje a la central',
    about: (code: string) => `Sobre el trabajo ${code}`,
    empty: 'Aún no hay mensajes. Escribe a la central si necesitas algo.',
    offline: 'Sin conexión: lo que escribas se envía al volver la señal.',
    desk: 'Central',
    you: 'Tú',
    meta: (
      who: string,
      at: string,
      state: 'sent' | 'queued' | null,
      bookingCode: string | null,
    ) =>
      [
        who,
        at,
        state === 'sent' ? 'enviado' : state === 'queued' ? 'en cola' : null,
        bookingCode,
      ]
        .filter(Boolean)
        .join(' · '),
    label: 'Mensaje a la central',
    placeholder: 'Escribe a la central',
    send: 'Enviar',
    queueNote: 'Sin conexión el mensaje espera en cola; si es urgente, llama.',
    refused:
      'La central no aceptó un mensaje guardado: el trabajo ya no es tuyo o la hora del teléfono está mal. Llama si era importante.',
  },
  nav: {
    label: 'Secciones',
    home: 'Inicio',
    calendar: 'Calendario',
    jobs: 'Trabajos',
    profile: 'Perfil',
  },
  /** W-Job (`docs/schema-w-job.md`, approved J1–J9). */
  job: {
    title: 'Trabajo',
    today: 'Trabajo de hoy',
    on: (date: string) => `Trabajo del ${date}`,
    back: 'Volver',
    list: 'Trabajos',
    listEmpty: 'No tienes trabajos asignados.',
    open: 'Ver el trabajo',
    savedAt: (time: string) => `Sin conexión · guardado ${time}`,
    synced: 'Sincronizado',
    state: {
      none: 'Asignado',
      EN_ROUTE: 'En camino',
      ARRIVED: 'En el lugar',
      STARTED: 'En servicio',
      FINISHED: 'Terminado · gracias',
    },
    travelers: 'Viajeros',
    meetingPoint: 'Recogida',
    dropOff: 'Destino',
    brief: 'Indicaciones de la central',
    noBrief: 'La central no ha dejado indicaciones. Si te falta algo, llama.',
    pay: 'Pago',
    contacts: 'Contactos',
    host: (name: string | null) =>
      name ? `${name} · casa de esta noche` : 'Casa de esta noche',
    desk: 'Central 24/7',
    call: (who: string) => `Llamar: ${who}`,
    privacy:
      'Ves solo el nombre, el idioma y los teléfonos locales de contacto. Los datos de pago y la dirección del viajero en su país nunca llegan a esta app.',
    steps: 'Pasos del servicio',
    stepsLater: (date: string) => `Los pasos se activan el ${date}, el día del servicio.`,
    stepsClosed:
      'Los pasos se activan cuando el viaje esté confirmado y pagado. Si ya estás en camino, llama a la central.',
    stepsNote:
      'Cada paso se guarda con la hora en el teléfono y se envía al volver la señal; la central y los viajeros ven «en camino» y «entregado».',
    stepDone: (time: string) => `Hecho · ${time}`,
    stepQueued: (time: string) => `Guardado · ${time} · se enviará al volver la señal`,
    stepRefused:
      'La central no aceptó un paso o un aviso guardado: el trabajo cambió o ya había otro registrado. Llama si tienes dudas.',
    emergency: 'Reportar emergencia en el lugar',
    emergencyTitle: 'Emergencia · ¿qué pasa?',
    emergencyCallDesk: 'Llamar a la central 24/7',
    emergencyNotify: 'Avisar a la central con mi ubicación',
    emergencyNumbers: [
      { label: 'Ambulancia 104', phone: '104' },
      { label: 'Policía 106', phone: '106' },
      { label: 'Bomberos 105', phone: '105' },
    ],
    cancel: 'Cancelar',
    locating: 'Buscando tu ubicación…',
    notified: (time: string, kind: string) => `Central avisada · ${time} · ${kind}`,
    notifiedText:
      'La central te llamará. Si no llega la llamada, marca el 104 / 106 según el caso.',
    notifiedSms:
      'Sin datos: abrimos el SMS a la central con tu ubicación. Pulsa Enviar. El aviso también se enviará por la app al volver la señal.',
    smsAgain: 'Enviar también por SMS',
    callNow: 'Llamar ahora',
    noDeskPhone:
      'La app no tiene el teléfono de la central. Marca el 104 / 106 según el caso.',
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
    reason: 'Motivo:',
    reasonLabel: 'Motivo del bloqueo de este día',
    rangeReasonLabel: 'Motivo de los días',
    reasons: {
      FAMILY: 'Familia',
      VEHICLE_REPAIR: 'Carro en taller',
      OTHER_JOB: 'Otro trabajo',
      OTHER: 'Otro',
    },
    reasonSaved: (reason: string) => `Motivo guardado: ${reason}.`,
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
  earnings: {
    open: 'Fiabilidad y pagos',
    title: 'Fiabilidad y pagos',
    reliability: 'Tu fiabilidad',
    basis: (answered: number) =>
      answered === 1
        ? 'sobre 1 oferta respondida'
        : `sobre ${answered} ofertas respondidas`,
    noScore: (answered: number, min: number) =>
      `Aún no hay número: llevas ${answered} de ${min} respuestas.`,
    meets: 'Recibes ofertas automáticas',
    below: 'Por debajo del mínimo: sin ofertas automáticas',
    accepted: 'Aceptados',
    declined: 'Rechazados',
    timedOut: 'Sin respuesta',
    rule: (floor: number) =>
      `Cuenta cada oferta que aceptas, rechazas o dejas sin respuesta. Por debajo de ${floor} la central te saca de las ofertas automáticas hasta hablar contigo.`,
    payouts: 'Pagos',
    pending: 'Pendiente',
    jobs: (count: number) =>
      count === 1 ? '1 trabajo terminado' : `${count} trabajos terminados`,
    thisMonth: 'Este mes',
    paidYear: (year: number) => `Pagado en ${year}`,
    count: (count: number) => (count === 1 ? '1 trabajo' : `${count} trabajos`),
    issue: (amount: string, count: number) =>
      `${amount} con incidencia en el pago (${count === 1 ? '1 trabajo' : `${count} trabajos`}). Llama a la central.`,
    method: {
      CASH_OFFICE: (office: string | null) =>
        office ? `Efectivo EUR · ${office}` : 'Efectivo EUR',
      BANK_TRANSFER: 'Transferencia bancaria',
    },
    methodNotSet: 'La central aún no ha anotado cómo cobras.',
    changeMethod: 'Llamar a la central para cambiarla',
    nextPay: 'Próximo pago',
    nextPayLine: (day: string, from: string, to: string, cash: boolean) =>
      `${day} ${from}–${to}${cash ? ' · trae tu carnet' : ''}`,
    howPaid: (days: number) =>
      `Cada trabajo se paga ${days === 1 ? '1 día hábil' : `${days} días hábiles`} después de terminarlo. Firmas un recibo por cada pago; aquí guardas la copia.`,
    paidOn: (day: string) => `Pagado ${day}`,
    receipts: 'Recibos (PDF)',
    openReceipt: 'Abrir recibo',
    openReceiptFor: (day: string) => `Abrir el recibo del ${day}`,
    receiptTitle: 'Recibo de pago',
    receiptFailed:
      'No se pudo abrir el recibo. Inténtalo de nuevo o pide la copia en la central.',
    noReceipts: 'Aún no hay pagos registrados.',
    history: 'Historial',
    noHistory: 'Aún no tienes trabajos terminados.',
    state: { PENDING: 'Pendiente', PAID: 'Pagado', ISSUE: 'Incidencia' },
    refused: 'No se pudo cargar. Inténtalo de nuevo o llama a la central.',
    back: 'Volver al inicio',
  },
  credentials: {
    open: 'Mis credenciales',
    title: 'Mis credenciales',
    state: {
      ACTIVE: 'Estado: activa',
      IN_REVIEW: 'Estado: en revisión',
      EXPIRING: 'Estado: vence pronto',
      SUSPENDED: 'Estado: suspendida',
    },
    offers: (auto: boolean) =>
      auto ? 'recibes ofertas automáticas' : 'sin ofertas automáticas',
    allVerified: 'Todo verificado por la central.',
    next: (kind: string, day: string) => `Siguiente vencimiento: ${kind}, ${day}.`,
    number: (number: string) => `Número ${number}`,
    expires: (day: string, days: number) =>
      days < 0
        ? `Venció ${day}`
        : `Vence ${day} · ${days === 1 ? '1 día' : `${days} días`}`,
    reviewed: (day: string, name: string | null) =>
      name ? `Revisada ${day} · ${name} (central)` : `Revisada ${day}`,
    rule: (day: string, window: number) =>
      `Desde el ${day} (${window} días antes) dejas de recibir ofertas automáticas hasta subir la nueva.`,
    ruleLabel: 'Regla',
    missing: 'Aún no la tenemos. Súbela para que la central la revise.',
    vehicle: (model: string, plate: string, seats: number, airConditioning: boolean) =>
      `Vehículo ${model} · ${plate} · ${seats} plazas${airConditioning ? ' · aire acondicionado' : ''}`,
    identityChecked:
      'Comprobado por la central. No guardamos la foto. Solo se usa para comprobar que los documentos son tuyos; nunca se muestra a los viajeros.',
    identityMissing:
      'Enséñalo en la central o por videollamada. No se sube por la app: no guardamos la foto.',
    uploadRenewal: 'Subir renovación o nueva foto',
    uploadFirst: 'Subir la foto',
    takePhoto: 'Hacer foto',
    fromGallery: 'Elegir de la galería',
    preview: (size: string) => `vista previa · ${size}`,
    checks: [
      'Las cuatro esquinas se ven',
      'Sin reflejos sobre el número',
      'Fecha de vencimiento legible: compruébala tú también',
    ],
    send: 'Enviar a revisión',
    retake: 'Repetir',
    cancel: 'Cancelar',
    pending: 'Enviada · en revisión',
    pendingExplain: (stillValid: boolean) =>
      stillValid
        ? 'La central la revisa en 1–2 días laborables. Sigues activo porque la actual no ha vencido. Te avisamos por SMS.'
        : 'La central la revisa en 1–2 días laborables. Te avisamos por SMS.',
    rejected: (reason: string) => `La central no la aceptó: ${reason}`,
    tooBig: 'La foto pesa más de 5 MB. Repítela o elige otra.',
    noImage: 'No se pudo leer la foto. Repítela o elige otra.',
    cameraDenied:
      'Sin permiso para la cámara. Elige la foto de la galería o da el permiso en los ajustes del teléfono.',
    offline: 'Sin conexión. La foto sigue aquí: envíala cuando vuelva la señal.',
    refusedUpload: 'La central no aceptó el envío. Repite la foto o llama a la central.',
    how: 'Cómo funciona',
    legend: (window: number) => [
      {
        state: 'Activa',
        text: 'Documentos verificados y vigentes. Ofertas automáticas.',
      },
      {
        state: 'En revisión',
        text: 'Subiste algo nuevo; la central lo comprueba en 1–2 días.',
      },
      {
        state: 'Vence pronto',
        text: `Menos de ${window} días: sin ofertas automáticas, la central puede asignarte a mano.`,
      },
      {
        state: 'Suspendida',
        text: 'Documento vencido o rechazado. Nunca se emite un bono con un colaborador sin licencia.',
      },
    ],
    refused: 'No se pudo cargar. Inténtalo de nuevo o llama a la central.',
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

type StepWords = { label: string; action: string };

const TRANSPORT_STEPS: Record<JobStep, StepWords> = {
  EN_ROUTE: { label: 'En camino', action: 'Salgo ahora' },
  ARRIVED: { label: 'He llegado', action: 'He llegado' },
  STARTED: { label: 'Pasajeros a bordo', action: 'A bordo' },
  FINISHED: { label: 'Entregado', action: 'Entregado' },
};

const GUIDE_STEPS: Record<JobStep, StepWords> = {
  EN_ROUTE: { label: 'En camino', action: 'Salgo ahora' },
  ARRIVED: { label: 'He llegado', action: 'He llegado' },
  STARTED: { label: 'Con el grupo', action: 'Empezamos' },
  FINISHED: { label: 'Terminado', action: 'Terminado' },
};

const STAY_STEPS: Record<JobStep, StepWords> = {
  EN_ROUTE: { label: 'En camino', action: 'Salgo ahora' },
  ARRIVED: { label: 'He llegado', action: 'He llegado' },
  STARTED: { label: 'Huéspedes llegaron', action: 'Han llegado' },
  FINISHED: { label: 'Salida', action: 'Ya se fueron' },
};

/** A step's name and button for the service type (W-Job; `jobStepsFor` picks the steps). */
export function stepWords(serviceType: ServiceType, step: JobStep): StepWords {
  const words =
    serviceType === 'TRANSPORTATION'
      ? TRANSPORT_STEPS
      : serviceType === 'ACCOMMODATION'
        ? STAY_STEPS
        : GUIDE_STEPS;
  return words[step];
}

/** The board's four emergency types; `short` is how the sent notice names it. */
export const EMERGENCY_TYPES: ReadonlyArray<{
  key: EmergencyCategory;
  label: string;
  short: string;
}> = [
  { key: 'MEDICAL', label: 'Médica · alguien necesita atención', short: 'médica' },
  {
    key: 'MECHANICAL',
    label: 'Mecánica · el vehículo no puede seguir',
    short: 'mecánica',
  },
  { key: 'SECURITY', label: 'Seguridad · robo, agresión, accidente', short: 'seguridad' },
  { key: 'OTHER', label: 'Otra · lo explico por teléfono', short: 'otra' },
];
