2020-01-12:

Currently all elements are wrapped in a `<g>` tag that is translated relative
to its parent. This is convenient because elements can define themselves as if
they are at origin 0,0 and then be translated by the parent element which in
turn can be translated by it's parent etc. This is represented by this
structure:

    <g transform="translate(x,y)">
        <path d="" />                   <!-- Main element path -->
        <g transform="translate(x,y)">  <!-- First child -->
            <path d="" />               <!-- Element path -->
        </g>
        <g transform="translate(x,y)">  <!-- Second child -->
            <path d="" />               <!-- Element path -->
        </g>
    </g>

This means each `<g>` element is a container for a collection of graphical
elements.

However when considering snap points when a child element is disconnected from
its parent, its coordinate system must change from relative-to-the-old-parent
to relative-to-the-new-parent (or the root document). Furthermore each parent
element snap points are defined relative to the 0,0 of the parent, so free
floating elements need to test if they are close to a snap point and so
different coordinate systems must be employed.

The solution is for each element to be able to report its position relative to
the global space in addition to its position relative to the parent. This way
dragged elements that get disconnected from the parent can attach to the root
element and be repositioned seamlessly. Also tests for snap points can be made
in this global coordinate space.

2020-01-14:

Managed to get absolute position working for elements. This means I can
generate the snap points in the global coordinate space. However the snap
points are still stored and regenerated in the block objects, meaning a
recursive traversal of the elements in order to build a flat list of snap
points in the root element. This would make scanning for elements a simple
loop. The flat list would need to contain a reference to the element it belongs
to in order to make the connection if there is a match.

I still wonder if it's worse to just have every block element represented as a
flat list in the root of the SVG, all positioned absolutely in document
coordinates. This would make scanning for snaps much easier. It would make
moving groups of elements a bit more tricky because on a drag selection the
block tree would need to be recursively walked to discover all the elements to
be dragged, and then each one moved individually. It still might work better
than having the `<g>` elements though... I think I will try it out.

2020-01-15:

Have a solution regarding snaps: The root SVG element contains all elements,
and each has a shanityBlock attribute if it's a block. So get all child
elements of the root SVG and call getSnaps on them. This returns a list of snap
points in global space, as well as the element the snap belongs to. My
challenge now is to figure out how to disconect from a snap. I will need to
test when an element moves if it gets too far away from the snap it's connected
to. In addition to this when a snap matches the "block" is the entire block
where the snap matches. This means the block would need to figure out which
snap point was matched in order to attach the free floating element. To do that
it would need to transform the global coordinates back to local coordinates. To
me it points to having an object representing the connection between two
elements.

A receptor is an object that the (0,0) corner of a block can be connected to.
It holds a reference to the parent block, it's relative and absolute location,
and if connected a reference to the connected block.

-- UPDATE --

The primary reason for them was to make it easier to detect when connected
elements are pulled apart - so they become disconnected. Eg: if a Receptor
location becomes too far away from its conectedTo to the following happens:

    1) The connectedTo is unset in the Receptor.
    2) If the connectedTo block has a connected lastReceptor it is swapped in
       place.

This allows items in a linked list of blocks and Receptors to be pulled out,
with the next block in the linked list moving up to take its place. If a block
is brought near to a Receptor:

    1) If the Receptor has a connectedTo this is connected to the block
       lastReceptor
    2) The block is set as the connectedTo of the receptor.

This allows insertion into a linked list. One potential issue is the conectedTo
block has knowledge of movement, yet it is unaware of being connected to a
Receptor. If it did it could check for a disconnection without scanning all
global Receptors. If an unconnected block moves it would still need to scan all
Receptors to see if there is a collision. That problem wouldn't go away but it
wouldn't be made worse so I think it's better to refactor so the block knows
what its connected to.

This implies moving the receptor to the "top" of the block, rather than having
Receptors to receive blocks.
