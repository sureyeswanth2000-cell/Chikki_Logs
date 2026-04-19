const nextConfig = {
    output: 'export',
    basePath: '/Chikki_Logs',
    assetPrefix: '/Chikki_Logs',
    images: {
        unoptimized: true,
    },
    turbopack: {
        root: process.cwd(),
    },
};

export default nextConfig;


