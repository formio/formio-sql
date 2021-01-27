import debugLib from 'debug';
export default (prefix: string) => {
  // 💥 Pay attention to these! 💥
  const error = debugLib(`${prefix}:error`);
  error.color = '1';
  // Higher priority messages
  const warn = debugLib(`${prefix}:warn`);
  warn.color = '3';
  // Status messages (responses and such)
  const log = debugLib(`${prefix}:log`);
  log.color = '2';
  // For logging out objects (responses and such)
  const debug = debugLib(`${prefix}:debug`);
  debug.color = '4';
  return {
    error,
    warn,
    log,
    debug,
  };
};
