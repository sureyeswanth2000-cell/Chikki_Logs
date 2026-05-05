const nextConfig = {
    output: 'export',
    trailingSlash: true,
    images: {
        unoptimized: true,
    },
    turbopack: {
        root: process.cwd(),
    },
};

export default nextConfig;


