// Age in whole years from a 'YYYY-MM-DD' birth date.
export function ageOn(dobStr, ref = new Date()) {
  const [y, m, d] = dobStr.split('-').map(Number);
  const age = ref.getFullYear() - y;
  const birthdayPassed =
    ref.getMonth() + 1 > m || (ref.getMonth() + 1 === m && ref.getDate() >= d);
  return birthdayPassed ? age : age - 1;
}
