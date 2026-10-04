export const validate = (schemas) => (req, _res, next) => {
  req.valid = {};
  for (const key of ["body", "query", "params"]) {
    if (schemas[key]) req.valid[key] = schemas[key].parse(req[key]);
  }
  next();
};
