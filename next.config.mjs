const nextConfig = {
    output: 'export',
    basePath: '/Chikki_Logs',
    assetPrefix: '/Chikki_Logs',
    trailingSlash: true,
    images: {
        unoptimized: true,
    },
    turbopack: {
        root: process.cwd(),
    },
};

export default nextConfig;


