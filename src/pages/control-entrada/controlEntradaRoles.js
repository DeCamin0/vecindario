/** Puede añadir / editar / borrar registros. */
export function canWriteControlEntrada(access) {
  return access === 'write'
}

/** Puede ver el control de entrada. */
export function canViewControlEntrada(access) {
  return access === 'read' || access === 'write'
}
