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
    this.svgElement = null;
    this.svgGhostElement = null;
    this.globalSnaps = [];
    this.position = {x: 0, y: 0};
    this.connector = new Connector(this);
    this.moveRelative = function(dx, dy) {
        this.position.x += dx;
        this.position.y += dy;
        this.moveToPosition();
        // Recursively move all the child blocks.
        var children = this.childBlocks();
        for (var i = 0; i < children.length; i++) {
            children[i].moveRelative(dx, dy);
        }
        // If the block is connected to something detect if it got moved too
        // far away and disconnect it if so.
        var connectedTo = this.connector.connectedTo();
        if (!connectedTo) {
            return;
        }
        var dist = pointDistance(connectedTo.getGlobalPosition(), this.position);
        if (dist >= 2) {
            disconnectBlock(this);
            this.deleteGhostElement();
        }
    };
    this.moveToPosition = function() {
        var transforms = this.svgElement.transform.baseVal;
        var transform = transforms.getItem(0);
        transform.setTranslate(this.position.x, this.position.y);
    };
    this.isDraggable = function() {
        return this.svgElement.classList.contains('draggable') ? true : false;
    };
    this.svgRemove = function() {
        this.svgElement.parentElement.removeChild(this.svgElement);
    };
    this.deleteGhostElement = function() {
        if (!this.svgGhostElement) {
            // The ghost element might have been removed mid-drag when the
            // connectors get too far apart. As this is also called at the end
            // of a drag regardless we need to make sure we are not removing
            // something already removed.
            return;
        }
        this.svgElement.parentElement.removeChild(this.svgGhostElement);
        this.svgGhostElement = null;
    };
    this.addGhostElement = function() {
        // Generate a ghost element - a dotted path indicating the original
        // position during a drag.
        var pos = this.position;
        var path = this.path();
        this.svgGhostElement = svgDottedPath(path);
        this.svgGhostElement.setAttribute("stroke", "#d85b49");
        this.svgGhostElement.setAttribute("transform", translateString(pos.x, pos.y));
        this.svgElement.parentElement.appendChild(this.svgGhostElement);
    };
    this.beginDrag = function() {
        this.addGhostElement();
    };
    this.endDrag = function() {
        this.deleteGhostElement();
        // This code is to mainly handle the case where the block has moved a
        // short distance but is still connected to the original receptor. We
        // want to move it back to its original position.
        var connectedTo = this.connector.connectedTo();
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
    this.build = function(data) {
        this.label = new BlockText();
        this.label.build(data[1]);
        this.type = new BlockType();
        this.type.build(data[2]);
        this.value = this.type.decodeValue(data[3]);
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
    this.path = function() {
        var path = [];
        var h = this.getHeight();
        path.push([0, 0]);
        lineWithTab(path, 0, 8, 0);
        path.push([8, h]);
        lineWithTab(path, 8, 0, h);
        return path;
    };
    this.svg = function(x, y) {
        var path = this.path(x, y);
        this.position.x = x;
        this.position.y = y;
        this.svgElement = svgPath(path);
        this.svgElement.setAttribute("fill", "#59fa81");
        this.svgElement.setAttribute("stroke", "#d85b49");
        this.svgElement.setAttribute("transform", translateString(x, y));
        this.svgElement.setAttribute("class", "draggable");
        this.svgElement.shanityBlock = this;
        return [this.svgElement];
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
    this.svgElement = null;
    this.build = function(data) {
        var args = data[2];
        var body = data[4];
        this.label = new BlockText();
        this.label.build(data[1]);
        this.buildChained(args, this.args);
        this.buildChained(body, this.body);
        this.comment = new BlockText();
        this.comment.build(data[3]);
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
    this.path = function() {
        var w = this.getWidth();
        var h = 0;
        var path = [];
        path.push([0, 0]); // start
        path.push([w, h]); // top line across to right
        h += 2;
        path.push([w, h]); // line down on right
        lineWithTab(path, w, 1, h);
        var ah = h;
        h += this.getArgsHeight();
        path.push([1, h]); // left hand line down where args are
        lineWithTab(path, 1, w, h);
        h += 2;
        path.push([w, h]); // line down on right
        lineWithTab(path, w, 1, h);
        var bh = h;
        h += this.getBodyHeight();
        path.push([1, h]); // left hand line down where body is
        lineWithTab(path, 1, w, h);
        h += 2;
        path.push([w, h]); // line down on right
        path.push([0, h]); // line back left to 0
        return path;
    };
    this.svg = function(x, y) {
        var path = this.path();
        this.position.x = x;
        this.position.y = y;
        this.svgElement = svgPath(path);
        this.svgElement.setAttribute("fill", "#59fa81");
        this.svgElement.setAttribute("stroke", "#d85b49");
        this.svgElement.setAttribute("transform", translateString(x, y));
        this.svgElement.setAttribute("class", "draggable");
        this.svgElement.shanityBlock = this;
        var svgs = [];
        svgs.push(this.svgElement);

        var ah = 2;
        this.args.iterateChain(function(block) {
            var elements = block.svg(x + 1, y + ah);
            for (var i = 0; i < elements.length; i++) {
                svgs.push(elements[i]);
            }
            ah += block.getHeight();
        });

        var bh = this.getArgsHeight() + 4;
        this.body.iterateChain(function(block) {
            var elements = block.svg(x + 1, y + bh);
            for (var i = 0; i < elements.length; i++) {
                svgs.push(elements[i]);
            }
            bh += block.getHeight();
        });

        return svgs;
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
        if (!this.selectedElement) {
            return;
        }
        this.selectedElement.endDrag();
        this.selectedElement = null;
    };
    this.getMousePosition = function(evt) {
        var CTM = this.view.getScreenCTM();
        return {
            x: (evt.clientX - CTM.e) / CTM.a,
            y: (evt.clientY - CTM.f) / CTM.d
        };
    };
    this.svgBuild = function(block) {
        this.rootBlock = block;
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

function svgPath(parts) {
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
    path.setAttribute("d", d);
    path.setAttribute("stroke-width", "0.1");
    return path;
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
