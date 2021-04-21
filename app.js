const axios = require('axios');
const colorConvert = require('color-convert');
const jimp = require('jimp');
const inquirer = require('inquirer');
const socket = require('socket.io-client');
var gis = require('g-i-s');

let is_draw = false;
let prompt = null;

const MAX_WIDTH = 767;
const MAX_HEIGHT = 448;

class GarticRobot {
    constructor() {
        this.user = {};

        this.draw = {
            color: 'x000000'
        };
    }

    async createUser(user) {
        if (!user) {
            user = {};
        }

        try {
            let body = {
                avatar: 0,
                language: 1,
                name: `u-${+ new Date}`,
                ...user
            };

            let { data } = await axios.post('https://gartic.io/req/user', body);

            if (data) {
                this.user = body;
            } else {
                throw "User can't be created";
            }
        } catch (error) {
            console.log(error);
        }

        return this.user;
    }

    async joinRoom(room) {
        let server = await this.getServer(room);
        let client = socket(`wss://${server}`);

        client.on('connect', () => {
            let data = {
                avatar: this.user.avatar,
                nick: this.user.name,
                sala: room.substr(2, room.length - 2),
                v: 20000
            };

            client.emit(3, data);
        });

        client.on(5, async (token, id) => {
            this.user.token = token;
            this.user.id = id;

            client.emit(46, id);
        });

        client.on('disconnect', () => {
            console.log('Disconnected');
        });

        client.on(16, async (optionOne, syllablesOptionsOne, optionTwo, syllablesOptionsTwo) => {
            let choices = [
                optionOne,
                optionTwo
            ];

            let { draw } = await inquirer.prompt([{
                type: 'list',
                name: 'draw',
                message: 'Escolha o desenho:',
                choices
            }]);

            client.emit(34, this.user.id, choices.indexOf(draw));

            client.once(34, async () => {

                let imageUrl = null;

                let imagens = await new Promise((resolve, reject) => {
                    gis(draw, logResults);
                    function logResults(error, results) {
                        if (error)
                            reject(false);
                        else
                            resolve(results)
                    }
                });

                let choices = [];
                let urls = [];
                for (let index = 0; index < 10; index++) {
                    const element = imagens[index];
                    let link = hostname(element.url)
                    choices.push(index + " - " + link);
                    urls.push(element.url);
                }

                if (choices.length > 0) {
                    let { url } = await inquirer.prompt([{
                        type: 'list',
                        name: 'url',
                        message: 'Choose a drawing',
                        choices
                    }]);

                    url = urls[choices.indexOf(url)];
                    imageUrl = url;
                } else {
                    let { url } = await inquirer.prompt([{
                        type: 'input',
                        name: 'url',
                        message: 'Image URL:'
                    }]);
                    imageUrl = url;
                }

                let image = await jimp.read(imageUrl);

                let height = image.getHeight();
                let width = image.getWidth();

                if (width > height) {
                    width = width > 700 ? 700 : width;
                    image.resize(width, jimp.AUTO);
                } else {
                    height = height > 350 ? 350 : height;
                    image.resize(jimp.AUTO, height);
                }

                let data = image.bitmap.data;
                height = image.getHeight();
                width = image.getWidth();

                let pixels = {};

                let offsetX = Math.round((MAX_WIDTH - width) / 2);
                let offsetY = Math.round((MAX_HEIGHT - height) / 2);

                image.scan(0, 0, width, height, function (x, y, idx) {
                    if ((x === 0 || !(x % 4)) && (y === 0 || !(y % 4))) {
                        let red = data[idx];
                        let green = data[idx + 1];
                        let blue = data[idx + 2];

                        if (red > 240 && green > 240 && blue > 240)
                            return

                        let color = `x${colorConvert.rgb.hex(red, green, blue)}`;

                        if (!pixels[color]) {
                            pixels[color] = [];
                        }

                        pixels[color].push([x + offsetX, y + offsetY]);
                    }
                });

                for (let color of Object.keys(pixels)) {
                    client.emit(10, this.user.id, [5, color]);

                    for (let pixel of pixels[color]) {
                        client.emit(10, this.user.id, [2, ...pixel]);
                    }
                }
            });
        });

        function hostname(url) {
            var match = url.match(/:\/\/(www[0-9]?\.)?(.[^/:]+)/i);
            if (match != null && match.length > 2 && typeof match[2] === 'string' && match[2].length > 0) return match[2];
        }

        client.on(17, async () => {
            is_draw = true;
            while (is_draw) {
                let { name } = await inquirer.prompt([{
                    type: 'input',
                    name: 'name',
                    message: 'Oque eh isso? '
                }]);

                if (name == ".") {
                    is_draw = false;
                    break;
                }

                client.emit(13, this.user.id, name);
            }
        });

        client.on(19, async () => {
            is_draw = false;
            console.log("Aguarde a proxima...");
        });
    }

    getUrl(draw) {
        return new Promise((resolve, reject) => {
            gis(draw, logResults);
            function logResults(error, results) {
                if (error)
                    reject(false);
                else
                    resolve(results)
            }
        })
    }

    async getServer(room) {
        try {
            let params = {
                check: 1
            };

            if (room) {
                params.room = room;
            }

            let { data } = await axios.get('https://gartic.io/server', { params });

            return data.replace('https://', '');
        } catch (error) {
            console.log(error);
        }

        return false;
    }
}

(async () => {
    let robot = new GarticRobot;

    try {
        let { name } = await inquirer.prompt([{
            type: 'input',
            name: 'name',
            message: 'User name:'
        }]);

        await robot.createUser({ name });

        let { room } = await inquirer.prompt([{
            type: 'input',
            name: 'room',
            message: 'Room:'
        }]);

        room = room.replace(/.*gartic.io\//g, '');

        robot.joinRoom(room);
    } catch (error) {
        console.log(error);
    }
})();
