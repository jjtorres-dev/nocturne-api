// Compartido entre PaymentsService/ExpensesService (agrupan sus sumas por
// período) y AccountingModule (expone el query param `groupBy`).
export enum TimelineGroupBy {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}
