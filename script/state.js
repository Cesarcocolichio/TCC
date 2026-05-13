export const TOLERANCIA_MINUTOS = 1;

export let compartimentos = [
  { id: 1, horario: null, ativo: false, estado: "sem_config", dataAlvo: null, sensor_aberto: false },
  { id: 2, horario: null, ativo: false, estado: "sem_config", dataAlvo: null, sensor_aberto: false },
  { id: 3, horario: null, ativo: false, estado: "sem_config", dataAlvo: null, sensor_aberto: false }
];

export let historico = [];

export function setHistorico(novoHistorico) {
    historico.length = 0;
    historico.push(...novoHistorico);
}

export function addAoHistorico(item) {
    historico.unshift(item);
}