const path         = require('path');
const webpack      = require('webpack');
const autoprefixer = require('autoprefixer');

const supportedBrowsers = [
    'last 1 version',
];

const isProduction = process.env.NODE_ENV === 'production';

const plugins = () => {
    const plugins = [
        new webpack.EnvironmentPlugin({
            NODE_ENV: 'development',
        }),

        new webpack.NamedModulesPlugin(),

        new webpack.LoaderOptionsPlugin({
            test: /\.less$/,
            options: {
                postcss: [
                    autoprefixer({browsers: supportedBrowsers}),
                ],
            }
        }),

        new webpack.NoEmitOnErrorsPlugin()
    ];

    if (isProduction) {
        plugins.push(new webpack.optimize.UglifyJsPlugin({sourceMap: true}));
    }

    return plugins;
};

module.exports = {
    target: 'web',
    entry: {
        main: ['./app/styles.less', './app/main.js'],
        rtcstats: ['./app/styles.less', './app/rtcstats.js'],
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        chunkFilename: '[id].js',
        publicPath: '/',
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'babel-loader',
                        options: {
                            presets: [
                                ['env', {
                                    targets: {browsers: supportedBrowsers},
                                    modules: false,
                                }],
                            ],
                            plugins: ['transform-runtime'],
                        },
                    },
                ],
            },
            {
                test: /\.less$/,
                use: ["style-loader", "css-loader", "postcss-loader", "less-loader"],
            },
        ],
    },
    devServer: {
        stats: 'errors-only',
        contentBase: './static',
    },
    devtool: 'source-map',
    plugins: plugins(),
};
