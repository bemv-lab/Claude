/** @type {import('next').NextConfig} */
export default {
  webpack: (config, {isServer}) => {
    // SQLite nativo do Node 22: fica fora do bundle.
    if (isServer) config.externals.push({'node:sqlite': 'commonjs node:sqlite'});
    return config;
  },
};
