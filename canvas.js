'use strict';

function sample_code() {
    return [
        "lambda",
        "some_function",
        [
            ["var", "x", "Num", 10],
            ["var", "s", "String", "test"]
        ],
        "",
        [
            ["var", "blah", "Num", 10],
            ["var", "boo", "String", "test"]
        ]
    ];
}

function translateString(x, y) {
    return "translate(" + x + "," + y + ")";
}

function BlockBuild(data) {
    // Helper function for turning a JSON structure into Block structures.
    if (data[0] === "lambda") {
        var obj = new BlockLambda();
        return obj.build(data);
    }
    if (data[0] === "bind") {
        var obj = new BlockBind();
        return obj.build(data);
    }
    if (data[0] === "var") {
        var obj = new BlockVar();
        return obj.build(data);
    }
    var obj = new BlockText()
    return obj.build(data[0]);
}

function Connector(parentBlock) {
    // A connector is associated with the top left corner of a block and
    // enables it to connect to one or more possible receptors on other blocks.
    // Because a block has only one top left corner there is only one connector
    // per block.
    this.parentBlock = parentBlock;
    this.receptor = null;
    this.position = {x: 0, y: 0};
    this.globalPosition = null;
    this.connectedTo = function() {
        return this.receptor;
    };
    this.connect = function(receptor) {
        if (this.receptor != null) {
            // The caller must disconect the receptor and decide what to do
            // about that before calling this.
            return;
        }
        this.receptor = receptor;
    };
    this.disconnect = function() {
        this.receptor = null;
    };
    this.append = function(connector) {
        var last = this.parentBlock.lastReceptor();
        if (!last) {
            return false;
        }
        connector.disconnect();
        connector.connect(last);
        return true;
    };
    this.block = function() {
        return this.parentBlock;
    };
    this.setPosition = function(x, y) {
        this.position.x = x;
        this.position.y = y;
        this.globalPosition = null;
    };
    this.getGlobalPosition = function() {
        return {
            x: this.parentBlock.position.x + this.position.x,
            y: this.parentBlock.position.y + this.position.y
        };
    };
}

function Receptor(parentBlock) {
    // Receptors are places on a block where other blocks can connect to.
    this.parentBlock = parentBlock;
    this.connector = null;
    this.position = {x: 0, y: 0};
    this.globalPosition = null;
    this.connectedTo = function() {
        return this.connector;
    };
    this.connect = function(connector) {
        if (this.conector != null) {
            console.log("could not connect connector to this occupied receptor");
            return;
        }
        this.connector = connector;
    };
    this.disconnect = function() {
        this.connector = null;
        this.parentBlock.receptorDisconected();
    };
    this.block = function() {
        return this.parentBlock;
    };
    this.iterateChain = function(callback) {
        // Blocks with a connector at the top and a receptor at the bottom can
        // form chains or linked lists of blocks. This function can be used to
        // iterate through such a list and perform some callback on the block.
        // It is called on the receptor that the first block connector is
        // attached to - the parent receptor.
        var receptor = this;
        var connector = receptor.connectedTo();
        if (!connector) {
            return;
        }
        var block = connector.block();
        while (block) {
            callback(block);
            receptor = block.lastReceptor();
            if (!receptor) {
                // This block has no lastReceptor, for example a terminating
                // block like a "return" block.
                break;
            }
            var connector = receptor.connectedTo();
            if (!connector) {
                // There is a receptor but it isnt connected to anything.
                break;
            }
            var block = connector.block();
        }
    };
    this.setPosition = function(x, y) {
        this.position.x = x;
        this.position.y = y;
        this.globalPosition = null;
    };
    this.getGlobalPosition = function() {
        // Receptor coordinates are defined relative to the block they belong
        // to. This returns the SVG absolute position. Receptors can move
        // around whenthe block changes shape so this is dynamic.
        return {
            x: this.parentBlock.position.x + this.position.x,
            y: this.parentBlock.position.y + this.position.y
        };
    };
}

function connectBlock(receptor, connector) {
    // This is a helper function to connect a receptor and a connector
    // together. It implements the "business logic" of when a connection is
    // made.
    if (connector.connectedTo()) {
        return;
    };
    var connectorExisting = receptor.connectedTo();
    if (connectorExisting) {
        // If the receptor is already connected to something, get that
        // something and connect it to the end of the thing we are connecting.
        // This should work like unshift().
        if (!connector.append(connectorExisting)) {
            // The new thing we are connecting might be a terminating block and
            // it doesnt have a receptor at the end. In which case we dont want
            // to make this connection.
            return;
        }
        console.log("appended connectorExisting");
        receptor.disconnect();
    }
    receptor.connect(connector);
    connector.connect(receptor);
}

function disconnectBlock(block) {
    // Helper function for when receptor and connector get too far apart. First
    // check if we are actually connected to something.
    var connectedTo = block.connector.connectedTo();
    if (!connectedTo) {
        return;
    }
    block.connector.disconnect();
    var last = block.lastReceptor();
    if (last) {
        // This will connect the next block in the chain to the original
        // receptor. Otherwise removing a block from the middle of a chain
        // would leave the chain broken.
        var lastConnectedTo = last.connectedTo();
        connectedTo.connect(lastConnectedTo);
    }
}

function pointDistance(p1, p2) {
    var dx = p1.x - p2.x;
    dx = dx * dx;
    var dy = p1.y - p2.y;
    dy = dy * dy;
    return Math.sqrt(dx + dy);
}

function BlockGraphical() {
    // This is the base class for blocks. A block is an element onscreen that
    // represents a bit of language. It holds logic common to blocks like
    // moving around and reacting to drag and drop events.
    this.position = {x: 0, y: 0};
    this.connector = new Connector(this);
    this.checkDisconnect = function(x, y) {
        if (x > 2 || y > 2) {
            disconnectBlock(this);
        }
    };
    this.receptorDisconected = function() {
        return null;
    };
    this.lastReceptor = function() {
        // The lastReceptor is for blocks where things can be appended to the
        // end. A lambda for example is not appendable because program flow can
        // not fall through at the end of a function call.
        return null;
    };
}

function BlockVar() {
    BlockGraphical.call(this);
    this.label = null;
    this.type = null;
    this.value = null;
    this.next = new Receptor(this);
    this.path = null;
    this.build = function(data) {
        //this.label = new BlockText();
        //this.label.build(data[1]);
        //this.type = new BlockType();
        //this.type.build(data[2]);
        //this.value = this.type.decodeValue(data[3]);
        this.next.setPosition(0, 2);
        return this;
    };
    this.lastReceptor = function() {
        return this.next;
    };
    this.receptors = function() {
        return [this.next];
    };
    this.getHeight = function() {
        return 2;
    };
    this.getWidth = function() {
        return this.label.getWidth() + 1 + this.type.getWidth();
    };
    this.buildPath = function(x, y) {
        var path = new Path2D();
        path.moveTo(x, y);
        path.lineTo(x + 8, y); //lineWithTab(path, 0, 8, 0);
        y += this.getHeight();
        path.lineTo(x + 8, y);
        path.lineTo(x, y); //lineWithTab(path, 8, 0, h);
        path.closePath();
        this.path = path;
    };
    this.draw = function(code, x, y) {
        if (code.isDragInPath(this.path)) {
            var off = code.getDragOffset();
            x += off.x;
            y += off.y;
            this.checkDisconnect(off.x, off.y);
        }
        var ctx = code.ctx;
        this.buildPath(x, y);
        ctx.fillStyle = "#59fa81";
        ctx.strokeStyle = "#d85b49";
        ctx.lineWidth = 0.2;
        ctx.stroke(this.path);
        ctx.fill(this.path);
    };
    this.childBlocks = function() {
        return [];
    };
}

function BlockLambda() {
    BlockGraphical.call(this);
    this.label = null;
    this.width = null;
    this.height = 6;
    this.args = new Receptor(this);
    this.argsHeight = null;
    this.comment = null;
    this.body = new Receptor(this);
    this.bodyHeight = null;
    this.path = null;
    this.build = function(data) {
        var args = data[2];
        var body = data[4];
        //this.label = new BlockText();
        //this.label.build(data[1]);
        this.buildChained(args, this.args);
        this.buildChained(body, this.body);
        //this.comment = new BlockText();
        //this.comment.build(data[3]);
        this.args.setPosition(1, 2);
        this.body.setPosition(1, 4 + (args.length * 2));
        return this;
    };
    this.buildChained = function(data, receptor) {
        if (data.length) {
            for (var i = 0; i < data.length; i++) {
                if (!receptor) {
                    // error condition
                    break;
                }
                var block = BlockBuild(data[i]);
                connectBlock(receptor, block.connector);
                receptor = block.lastReceptor();
            }
        }
    };
    this.receptors = function() {
        return [this.args, this.body];
    };
    this.receptorDisconected = function() {
        this.argsHeight = null;
        this.bodyHeight = null;
    };
    this.getWidth = function() {
        if (this.width === null) {
            if (this.label === null) {
                this.width = 6;
            }
            else {
                this.width = this.label.getWidth() + 2;
            }
        }
        return this.width;
    }
    this.getArgsHeight = function() {
        if (this.argsHeight === null) {
            this.argsHeight = 0;
            var thisBlock = this;
            this.args.iterateChain(function(block) {
                thisBlock.argsHeight += block.getHeight();
            });
        }
        return this.argsHeight;
    };
    this.getBodyHeight = function() {
        if (this.bodyHeight === null) {
            this.bodyHeight = 0;
            var thisBlock = this;
            this.body.iterateChain(function(block) {
                thisBlock.bodyHeight += block.getHeight();
            });
        }
        return this.bodyHeight;
    };
    this.getHeight = function() {
        return this.height + this.getArgsHeight() + this.getBodyHeight();
    };
    this.buildPath = function(x, y) {
        var path = new Path2D();
        var w = this.getWidth();
        path.moveTo(x, y);
        path.lineTo(x + w, y);
        y += 2;
        path.lineTo(x + w, y);
        path.lineTo(x + 1, y); //lineWithTab(path, w, 1, h);
        y += this.getArgsHeight();
        path.lineTo(x + 1, y);
        path.lineTo(x + w, y); //lineWithTab(path, 1, w, h);
        y += 2;
        path.lineTo(x + w, y);
        path.lineTo(x + 1, y); //lineWithTab(path, w, 1, h);
        y += this.getBodyHeight();
        path.lineTo(x + 1, y);
        path.lineTo(x + w, y); //lineWithTab(path, 1, w, h);
        y += 2;
        path.lineTo(x + w, y);
        path.lineTo(x, y);
        path.closePath();
        this.path = path;
    };
    this.draw = function(code, x, y) {
        if (code.isDragInPath(this.path)) {
            x += code.pointer.grid.x;
            y += code.pointer.grid.y;
        }
        var ctx = code.ctx;
        this.buildPath(x, y);
        ctx.fillStyle = "#59fa81";
        ctx.strokeStyle = "#d85b49";
        ctx.lineWidth = 0.2;
        ctx.stroke(this.path);
        ctx.fill(this.path);
        var ah = 2;
        this.args.iterateChain(function(block) {
            block.draw(code, x + 1, y + ah);
            ah += block.getHeight();
        });
        var bh = this.getArgsHeight() + 4;
        this.body.iterateChain(function(block) {
            block.draw(code, x + 1, y + bh);
            bh += block.getHeight();
        });
    };
    this.childBlocks = function() {
        var blocks = [];
        this.args.iterateChain(function(block) {
            blocks.push(block);
        });
        this.body.iterateChain(function(block) {
            blocks.push(block);
        });
        return blocks;
    };
}

function Pointer(callback) {
    this.callback = callback;
    this.start = {x: 0, y: 0};
    this.pos = {x: 0, y: 0};
    this.grid = {x: 0, y: 0};
    this.isMouseDown = false;
    this.mouseDown = function(x, y) {
        this.move(x, y);
        this.isMouseDown = true;
    };
    this.mouseUp = function(x, y) {
        this.isMouseDown = false;
        this.move(x, y);
    };
    this.move = function(x, y) {
        this.pos.x = x;
        this.pos.y = y;
        if (!this.isMouseDown) {
            this.start.x = x;
            this.start.y = y;
        }
        var gx = Math.ceil((x - this.start.x) / 10);
        var gy = Math.ceil((y - this.start.y) / 10);
        if (gx !== this.grid.x || gy !== this.grid.y) {
            if (this.isMouseDown) {
                this.callback(this);
            }
        }
        this.grid.x = gx;
        this.grid.y = gy;
    };
};

function Code() {
    this.view = null; // the whole <svg> element of the drawing area
    this.rootGroup = null; // the one and only child element of the view
    this.rootBlock = null;
    this.offset = null;
    this.selectedElement = null; // currently selected drag and drop element
    this.dragPos = {x: 0, y: 0};
    this.ctx = null;
    this.init = function(view) {
        this.view = view;
        view.addEventListener('mousedown', this.startDrag.bind(this), false);
        view.addEventListener('mousemove', this.drag.bind(this), false);
        view.addEventListener('mouseup', this.endDrag.bind(this), false);
        view.addEventListener('mouseleave', this.endDrag.bind(this));
        this.pointer = new Pointer(this.dragFunc.bind(this));
        this.ctx = view.getContext('2d');
    };
    this.getDragOffset = function() {
        return {
            x: this.pointer.grid.x,
            y: this.pointer.grid.y
        };
    };
    this.dragFunc = function(pointer) {
        this.ctx.clearRect(0, 0, this.view.width, this.view.height);
        this.rootBlock.draw(this, 1, 1);
    };
    this.isDragInPath = function(path) {
        if (!path) {
            return;
        }
        return this.ctx.isPointInPath(path, this.pointer.pos.x, this.pointer.pos.y);
    };
    this.startDrag = function(evt) {
        this.pointer.mouseDown(evt.x, evt.y);
    };
    this.drag = function(evt) {
        this.pointer.move(evt.x, evt.y);
    };
    this.checkSnaps = function(elem) {
        var nodes = this.view.children;
        for (var i = 0; i < nodes.length; i++) {
            var block = nodes[i].shanityBlock;
            if (!block) {
                continue;
            }
            var receptors = block.receptors();
            for (var j = 0; j < receptors.length; j++) {
                var receptor = receptors[j];
                var pos = receptor.getGlobalPosition();
                if (elem.position.x === pos.x && elem.position.y === pos.y) {
                    connectBlock(receptor, elem.connector);
                }
            }
        }
    };
    this.endDrag = function(evt) {
        this.pointer.mouseUp(evt.x, evt.y);
    };
    this.draw = function(block) {
        this.rootBlock = block;
        this.ctx.scale(10, 10);
        block.draw(this, 1, 1);
    };
}

function init() {
    var view = document.getElementById('the_canvas');
    var editor = new Code();
    editor.init(view);
    var lambda = BlockBuild(sample_code());
    editor.draw(lambda);
}

window.addEventListener('load', init);

/*
function BlockType() {
    BlockGraphical.call(this);
    this.label = null;
    this.svgElement = null;
    this.build = function(data) {
        this.label = new BlockText();
        this.label.build(data);
        return this;
    };
    this.decodeValue = function(data) {
    };
    this.getHeight = function() {
        return this.label.getHeight();
    };
    this.getWidth = function() {
        return this.label.getWidth();
    };
}

function BlockBind() {
    BlockGraphical.call(this);
    this.label = null;
    this.type = null;
    this.height = null;
    this.svgElement = null;
    this.build = function(data) {
        this.label = new BlockText();
        this.label.build(data[1]);
        this.type = new BlockType();
        this.type.build(data[2]);
        return this;
    };
    this.getHeight = function() {
        if (this.height === null) {
            this.height = 2;
        }
        return this.height;
    };
    this.getWidth = function() {
        return this.label.getWidth();
    };
}

function BlockText() {
    BlockGraphical.call(this);
    this.text = "";
    this.width = null;
    this.height = null;
    this.svgElement = null;
    this.build = function(text) {
        this.text = text;
        return this;
    };
    this.getWidth = function() {
        if (this.width === null) {
            this.width = 5;
        }
        return this.width;
    };
    this.getHeight = function() {
        if (this.height === null) {
            this.height = 1;
        }
        return this.height;
    };
}
*/
