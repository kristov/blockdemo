# Blockdemo

My attempt to create a low level block UI library like Scratch and Blockly. if you want a real library check out:

* [Blockly](https://developers.google.com/blockly/)
* [Scratch Blocks](https://github.com/LLK/scratch-blocks)

## Visual Programming

### Things that look like Scratch

### Other things

* [Skov](http://skov.software/en/)

## Refactoring

I tried to combine the visual and programming blocks into one concept. I think this is flawed. My new approach will be to:

* Make the raw data of the code (`sample_code()`) the model.
* Operations in the UI layer change the model directly (manipulate the raw json structure).
* Change to the model trigger a complete rebuild of the SVG from scratch.

Some challenges:

The height of a graphical element is dependent on the height of the child elements, however that means the child graphical objects need to exist so their height can be queried. So the graphical element objects must fully exist 
