# take lines with three numbers from a file and store them in a json file as arrays of three numbers
# usage: gmsh_to_json.py <inputfile> <outputfile>
import sys

with open(sys.argv[1], 'r') as f:
    lines = f.readlines()

# keep only lines between &nodes and &endnodes
start = lines.index('$Nodes\n')
end = lines.index('$EndNodes\n')
lines = lines[start+1:end]
lines = [line.split() for line in lines if (len(line.split())==3)]

with open(sys.argv[2], 'w') as f:
    f.write('{"nodes": \n')
    f.write('[\n')
    for i, line in enumerate(lines):
        f.write('[%s, %s, %s]' % (line[0], line[1], line[2]))
        if i < len(lines) - 1:
            f.write(',\n')
    f.write('\n]\n}')