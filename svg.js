'use strict';

function sample_code() {
    return [
        "lambda",
        "some_function",
        "This is a function",
        [
            ["var", "x", "Num", 10],
            ["var", "s", "String", "test"]
        ],
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
    if (data[0] === "lambda") {
        return new BlockLambda(data);
    }
    if (data[0] === "bind") {
        return new BlockBind(data);
    }
    if (data[0] === "var") {
        return new BlockVar(data);
    }
    return new BlockText(data[0]);
}

function Plug(parentBlock) {
    // A plug is associated with the top left corner of a block and
    // enables it to connect to one or more possible sockets on other blocks.
    // Because a block has only one top left corner there is only one plug
    // per block.

    this.parentBlock = parentBlock;
    this.socket = null;
    this.position = {"x": 0, "y": 0};

    this.connectedTo = function() {
        return this.socket;
    };

    this.connect = function(socket) {
        if (this.socket) {
            // The caller must disconect the socket and decide what to do
            // about that before calling this.
            return;
        }
        if (socket.connect(this)) {
            this.socket = socket;
            return true;
        }
    };

    this.disconnect = function() {
        this.socket.disconnect();
        this.socket = null;
    };

    this.block = function() {
        return this.parentBlock;
    };

    this.getGlobalPosition = function() {
        return {
            x: this.parentBlock.position.x + this.position.x,
            y: this.parentBlock.position.y + this.position.y
        };
    };
}

function Socket(parentBlock) {
    // Sockets are places on a block where other blocks can connect to.
    this.parentBlock = parentBlock;
    this.plug = null;
    this.position = {"x": 0, "y": 0};

    this.connectedTo = function() {
        return this.plug;
    };

    this.connect = function(plug) {
        if (this.conector) {
            return;
        }
        this.plug = plug;
        this.parentBlock.socketConnected();
        return true;
    };

    this.disconnect = function() {
        this.plug = null;
    };

    this.block = function() {
        return this.parentBlock;
    };

    this.iterateChain = function(callback) {
        // Blocks with a plug at the top and a socket at the bottom can
        // form chains or linked lists of blocks. This function can be used to
        // iterate through such a list and perform some callback on the block.
        // It is called on the socket that the first block plug is
        // attached to - the parent socket.
        var socket = this;
        var plug = socket.connectedTo();
        if (!plug) {
            return;
        }
        var block = plug.block();
        while (block) {
            callback(block);
            socket = block.lastSocket();
            if (!socket) {
                // This block has no lastSocket, for example a terminating
                // block like a "return" block.
                break;
            }
            var plug = socket.connectedTo();
            if (!plug) {
                // There is a socket but it isnt connected to anything.
                break;
            }
            block = plug.block();
        }
    };

    // Set the position of the socket relative to the (0,0) point of the
    // parent block.
    this.setPosition = function(x, y) {
        this.position.x = x;
        this.position.y = y;
    };

    // Returns the global position of the socket for testing collisions with
    // plugs. Socket coordinates are defined relative to the block they
    // belong to. This returns the SVG absolute position. Sockets can move
    // around when the block changes shape so this is dynamic.
    this.getGlobalPosition = function() {
        return {
            x: this.parentBlock.position.x + this.position.x,
            y: this.parentBlock.position.y + this.position.y
        };
    };
}

function pointDistance(p1, p2) {
    var dx = p1.x - p2.x;
    dx = dx * dx;
    var dy = p1.y - p2.y;
    dy = dy * dy;
    return Math.sqrt(dx + dy);
}

function BlockGraphical(data) {
    // This is the base class for blocks. A block is an element onscreen that
    // represents a bit of language. It holds logic common to blocks like
    // moving around and reacting to drag and drop events.
    this.data = data;
    this.svgElement = null;
    this.svgGhostElement = null;
    this.position = {x: 0, y: 0};

    // Every block has a plug - the top left corner of the element.

    // Move an element by a relative amount. Also move all child elements along
    // with it.
    this.moveRelative = function(dx, dy) {
        this.position.x += dx;
        this.position.y += dy;
        this.moveToPosition();

        // Recursively move all the child blocks.
        var children = this.dragBlocks();
        for (var i = 0; i < children.length; i++) {
            children[i].moveRelative(dx, dy);
        }

        // If the block is connected to something detect if it got moved too
        // far away and disconnect it if so.
        if (!this.plug) {
            return;
        }
        var connectedTo = this.plug.connectedTo();
        if (!connectedTo) {
            return;
        }
        var dist = pointDistance(connectedTo.getGlobalPosition(), this.position);
        if (dist >= 2) {
            this.plug.disconnect();
            this.deleteGhostElement();
        }
    };

    // Move this element to the current position.
    this.moveToPosition = function() {
        if (!this.svgElement) {
            return;
        }
        var transforms = this.svgElement.transform.baseVal;
        var transform = transforms.getItem(0);
        transform.setTranslate(this.position.x, this.position.y);
    };

    // Can this block be dragged
    this.isDraggable = function() {
        return this.svgElement.classList.contains('draggable') ? true : false;
    };
    this.svgRemove = function() {
        this.svgElement.parentElement.removeChild(this.svgElement);
    };

    // Generate a ghost element - a dotted path indicating the original
    // position during a drag.
    this.addGhostElement = function() {
        var pos = this.position;
        var path = this.path();
        this.svgGhostElement = svgDottedPath(path);
        this.svgGhostElement.setAttribute("stroke", "#d85b49");
        this.svgGhostElement.setAttribute("transform", translateString(pos.x, pos.y));
        this.svgElement.parentElement.appendChild(this.svgGhostElement);
    };

    // Remove the ghost element - the dotted line left behind when a drag is
    // started.
    this.deleteGhostElement = function() {
        if (!this.svgGhostElement) {
            // The ghost element might have been removed mid-drag when the
            // plugs get too far apart. As this is also called at the end
            // of a drag regardless we need to make sure we are not removing
            // something already removed.
            return;
        }
        this.svgElement.parentElement.removeChild(this.svgGhostElement);
        this.svgGhostElement = null;
    };

    // Called when a drag is started on the element.
    this.beginDrag = function() {
        this.addGhostElement();
    };

    // Called when the drag stops.
    this.endDrag = function() {
        this.deleteGhostElement();
        // This code is to handle the case where the block has moved a short
        // distance but is still connected to the original socket. We want to
        // move it back to its original position.
        if (!this.plug) {
            return;
        }
        var connectedTo = this.plug.connectedTo();
        if (!connectedTo) {
            // It is no longer connected to anything so we dont need to move it
            // back there.
            return;
        }
        var position = connectedTo.getGlobalPosition();
        var dx = position.x - this.position.x;
        var dy = position.y - this.position.y;
        if (dx != 0 || dy != 0) {
            this.moveRelative(dx, dy);
        }
    };

    this.socketConnected = function() {
        if (!this.svgElement) {
            return;
        }
        this.svgElement.setAttribute("stroke", "yellow");
        this.aBitLater(function() {
            this.svgElement.setAttribute("stroke", "#d85b49");
        });
        return null;
    };

    this.aBitLater = function(func) {
        setTimeout(func.bind(this), 500);
    };

    this.lastSocket = function() {
        // The lastSocket is for blocks where things can be appended to the
        // end. A lambda for example is not appendable because program flow can
        // not fall through at the end of a function call.
        return null;
    };
}

function BlockLinear(data) {
    BlockGraphical.call(this, data);

    this.plug = new Plug(this);
    this.socket = new Socket(this);
    this.socket.setPosition(0, 2);

    // The last socket of a linear block is the end socket.
    this.lastSocket = function() {
        return this.socket;
    };

    // Linear blocks only have one socket: the one at the end.
    this.sockets = function() {
        return [this.socket];
    };

    this.dragBlocks = function() {
        var connectedTo = this.socket.connectedTo();
        if (!connectedTo) {
            return [];
        }
        return [connectedTo.parentBlock];
    };
}

function BlockVar(data) {
    BlockLinear.call(this, data);

    this.label = data[1];

    //this.label = new BlockText(data[1]);
    //this.type = new BlockType(data[2]);;
    //this.value = this.type.decodeValue(data[3]);

    this.getHeight = function() {
        return 2;
    };

    this.getWidth = function() {
        return this.label.getWidth() + 1 + this.type.getWidth();
    };

    this.path = function() {
        var path = [];
        var h = this.getHeight();
        path.push([0, 0.5]);
        path.push([0.5, 0]);
        path.push([8, 0]);
        path.push([8, h]);
        path.push([0.5, h]);
        path.push([0, h + 0.5]);
        return path;
    };

    this.svg = function(x, y) {
        var path = this.path(x, y);
        this.position.x = x;
        this.position.y = y;
        this.svgElement = svgPathElement(svgD(path));
        this.svgElement.setAttribute("fill", "#7d5af0");
        this.svgElement.setAttribute("stroke", "#d880b8");
        this.svgElement.setAttribute("transform", translateString(x, y));
        this.svgElement.setAttribute("class", "draggable");
        this.svgElement.shanityBlock = this;
        return [this.svgElement];
    };
}

function BlockLambda(data) {
    BlockGraphical.call(this, data);

    this.label = data[1];

    this.buildChained = function(list, socket) {
        for (var i = 0; i < list.length; i++) {
            if (!socket) {
                break;
            }
            var block = BlockBuild(list[i]);
            block.plug.connect(socket);
            socket = block.lastSocket();
        }
    };

    //this.label = new BlockText(data[1]);
    //this.comment = new BlockText(data[2]);

    this.args = new Socket(this);
    this.buildChained(data[3], this.args);

    this.body = new Socket(this);
    this.buildChained(data[4], this.body);

    this.sockets = function() {
        return [this.args, this.body];
    };

    this.getWidth = function() {
        return 6;
    };

    this.getArgsHeight = function() {
        var height = 0;
        this.args.iterateChain(function(block) {
            height += block.getHeight();
        });
        return height;
    };

    this.getBodyHeight = function() {
        var height = 0;
        this.body.iterateChain(function(block) {
            height += block.getHeight();
        });
        return height;
    };

    this.getHeight = function() {
        return this.height + this.getArgsHeight() + this.getBodyHeight();
    };

    this.path = function() {
        var w = this.getWidth();
        var h = 0;
        var path = [];

        path.push([0, h]);
        path.push([w, h]);
        h += 2;
        path.push([w, h]);
        path.push([1.5, h]);
        path.push([1, h + 0.5]);

        h += this.getArgsHeight();
        path.push([1, h + 0.5]);
        path.push([1.5, h]);
        path.push([w, h]);
        h += 2;
        path.push([w, h]);
        path.push([1.5, h]);
        path.push([1, h + 0.5]);

        h += this.getBodyHeight();
        path.push([1, h + 0.5]);
        path.push([1.5, h]);
        path.push([w, h]);
        h += 2;
        path.push([w, h]);
        path.push([0, h]);

        return path;
    };

    this.svg = function(x, y) {
        var path = this.path();
        this.position.x = x;
        this.position.y = y;
        this.svgElement = svgPathElement(svgD(path));
        this.svgElement.setAttribute("fill", "#308840");
        this.svgElement.setAttribute("stroke", "#28c0c0");
        this.svgElement.setAttribute("transform", translateString(x, y));
        this.svgElement.setAttribute("class", "draggable");
        this.svgElement.shanityBlock = this;
        var svgs = [];
        svgs.push(this.svgElement);

        var h = 2;
        this.args.setPosition(1, 2);
        this.args.iterateChain(function(block) {
            var elements = block.svg(x + 1, y + h);
            for (var i = 0; i < elements.length; i++) {
                svgs.push(elements[i]);
            }
            h += block.getHeight();
        });
        h += 2;

        this.body.setPosition(1, 4 + this.getArgsHeight());
        this.body.iterateChain(function(block) {
            var elements = block.svg(x + 1, y + h);
            for (var i = 0; i < elements.length; i++) {
                svgs.push(elements[i]);
            }
            h += block.getHeight();
        });

        return svgs;
    };

    this.dragBlocks = function() {
        var blocks = [];
        if (this.args.connectedTo()) {
            blocks.push(this.args.connectedTo().parentBlock);
        }
        if (this.body.connectedTo()) {
            blocks.push(this.body.connectedTo().parentBlock);
        }
        return blocks;
    };
}

function Code() {
    this.view = null; // the whole <svg> element of the drawing area
    this.rootGroup = null; // the one and only child element of the view
    this.rootBlock = null;
    this.offset = null;
    this.selectedElement = null; // currently selected drag and drop element
    this.dragPos = {x: 0, y: 0};
    this.init = function(view) {
        this.view = view;
        view.addEventListener('mousedown', this.startDrag.bind(this), false);
        view.addEventListener('mousemove', this.drag.bind(this), false);
        view.addEventListener('mouseup', this.endDrag.bind(this), false);
        view.addEventListener('mouseleave', this.endDrag.bind(this));
    };
    this.startDrag = function(evt) {
        var elem = evt.target.shanityBlock;
        if (!elem) {
            return;
        }
        if (elem.isDraggable()) {
            this.offset = this.getMousePosition(evt);
            elem.beginDrag();
            var pos = elem.position;
            this.dragPos.x = pos.x;
            this.dragPos.y = pos.y;
            this.offset.x -= pos.x;
            this.offset.y -= pos.y;
            this.selectedElement = elem;
        }
    };
    this.drag = function(evt) {
        if (this.selectedElement) {
            evt.preventDefault();
            var coord = this.getMousePosition(evt);
            var x = Math.ceil(coord.x - this.offset.x);
            var y = Math.ceil(coord.y - this.offset.y);
            if (this.dragPos.x === x && this.dragPos.y === y) {
                return;
            }
            var diffx = x - this.dragPos.x;
            var diffy = y - this.dragPos.y;
            this.dragPos.x = x;
            this.dragPos.y = y;
            this.selectedElement.moveRelative(diffx, diffy);
            this.checkSnaps(this.selectedElement);
        }
    };
    this.checkSnaps = function(elem) {
        var nodes = this.view.children;
        for (var i = 0; i < nodes.length; i++) {
            var block = nodes[i].shanityBlock;
            if (!block) {
                continue;
            }
            var sockets = block.sockets();
            for (var j = 0; j < sockets.length; j++) {
                var socket = sockets[j];
                var pos = socket.getGlobalPosition();
                if (elem.position.x === pos.x && elem.position.y === pos.y) {
                    elem.plug.connect(socket);
                }
            }
        }
    };
    this.endDrag = function(evt) {
        if (!this.selectedElement) {
            return;
        }
        this.selectedElement.endDrag();
        this.selectedElement = null;
        this.svgRebuild();
    };
    this.getMousePosition = function(evt) {
        var CTM = this.view.getScreenCTM();
        return {
            x: (evt.clientX - CTM.e) / CTM.a,
            y: (evt.clientY - CTM.f) / CTM.d
        };
    };
    this.svgClear = function() {
        var child = this.view.lastElementChild;
        while (child) {
            this.view.removeChild(child);
            child = this.view.lastElementChild;
        }
    };
    this.svgRebuild = function() {
        console.log("rebuild");
        this.svgBuild(this.rootBlock);
    };
    this.svgBuild = function(block) {
        this.rootBlock = block;
        this.svgClear();
        var allElements = block.svg(1, 1);
        for (var i = 0; i < allElements.length; i++) {
            this.view.appendChild(allElements[i]);
        }
    };
}

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
    this.svg = function(x, y) {
        //this.svgElement.shanityBlock = this;
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
    this.svg = function(x, y) {
        //this.svgElement.shanityBlock = this;
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
    this.svg = function(x, y) {
        //this.svgElement.shanityBlock = this;
    };
}

function lineWithTab(path, fx, tx, y) {
    if (fx > tx) {
        // right to left
        path.push([tx + 3, y]);
        path.push([tx + 2.5, y + 0.5]);
        path.push([tx + 1.5, y + 0.5]);
        path.push([tx + 1, y]);
        path.push([tx, y]);
    }
    else {
        // left to right
        path.push([fx + 1, y]);
        path.push([fx + 1.5, y + 0.5]);
        path.push([fx + 2.5, y + 0.5]);
        path.push([fx + 3, y]);
        path.push([tx, y]);
    }
}

function svgPathElement(d) {
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("stroke-width", "0.2");
    return path;
}

function svgD(parts) {
    var first = parts.shift();
    var commands = [];
    commands.push(["M", first[0], first[1]].join(" "));
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        commands.push(["L", part[0], part[1]].join(" "));
    }
    commands.push("z");
    var d = commands.join(" ");
    return d;
}

function svgDottedPath(parts) {
    var first = parts.shift();
    var commands = [];
    commands.push(["M", first[0], first[1]].join(" "));
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        commands.push(["L", part[0], part[1]].join(" "));
    }
    commands.push("z");
    var d = commands.join(" ");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    //stroke-dasharray="5,5" fill="none"
    path.setAttribute("d", d);
    path.setAttribute("stroke-width", "0.1");
    path.setAttribute("stroke-dasharray", "0.2,0.2");
    path.setAttribute("fill", "none");
    return path;
}

function init() {
    var view = document.getElementById('the_canvas');
    var editor = new Code();
    editor.init(view);
    var lambda = BlockBuild(sample_code());
    editor.svgBuild(lambda);
}

window.addEventListener('load', init);
